use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Counter {
    pub count: u64,
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    msg!("week4-first-program: increment");

    let accounts_iter = &mut accounts.iter();
    let counter_account = next_account_info(accounts_iter)?;

    if counter_account.owner != program_id {
        msg!("account is not owned by this program");
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut data = counter_account.try_borrow_mut_data()?;
    if data.len() < 8 {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut counter = Counter::try_from_slice(&data[..8])?;
    counter.count = counter.count.saturating_add(1);
    counter.serialize(&mut &mut data[..8])?;

    msg!("count = {}", counter.count);
    Ok(())
}
