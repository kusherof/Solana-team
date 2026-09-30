use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub const COUNTER_SIZE: usize = 8;

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Eq)]
pub struct Counter {
    pub count: u64,
}

/// 0 = создать аккаунт счётчика, 1 = +1
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum CounterInstruction {
    Initialize,
    Increment,
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let ix = CounterInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match ix {
        CounterInstruction::Initialize => initialize(program_id, accounts),
        CounterInstruction::Increment => increment(program_id, accounts),
    }
}

fn initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let counter = next_account_info(accounts_iter)?;
    let _system_program = next_account_info(accounts_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !counter.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(COUNTER_SIZE);

    invoke(
        &system_instruction::create_account(
            payer.key,
            counter.key,
            lamports,
            COUNTER_SIZE as u64,
            program_id,
        ),
        &[payer.clone(), counter.clone(), _system_program.clone()],
    )?;

    let mut data = counter.try_borrow_mut_data()?;
    Counter { count: 0 }.serialize(&mut &mut data[..])?;
    msg!("week4: counter created, count = 0");
    Ok(())
}

fn increment(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut data = counter_account.try_borrow_mut_data()?;
    if data.len() < COUNTER_SIZE {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut counter = Counter::try_from_slice(&data[..COUNTER_SIZE])?;
    counter.count = counter
        .count
        .checked_add(1)
        .ok_or(ProgramError::InvalidAccountData)?;
    counter.serialize(&mut &mut data[..COUNTER_SIZE])?;
    msg!("week4: count = {}", counter.count);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counter_roundtrip() {
        let c = Counter { count: 7 };
        let mut buf = [0u8; 8];
        c.serialize(&mut &mut buf[..]).unwrap();
        let back = Counter::try_from_slice(&buf).unwrap();
        assert_eq!(back, c);
    }
}
