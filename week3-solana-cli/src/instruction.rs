use crate::account::{Account, Profile};
use crate::error::{ProgramError, ProgramResult};
use crate::ledger::Ledger;
use crate::pda::find_program_address;
use crate::pubkey::Pubkey;

/// Instruction enum — the same pattern as Solana programs (`match ix`).
#[derive(Clone, Debug)]
pub enum Instruction {
    CreateAccount {
        payer: Pubkey,
        new_account: Pubkey,
        lamports: u64,
    },
    Transfer {
        from: Pubkey,
        to: Pubkey,
        lamports: u64,
    },
    InitializeProfile {
        owner: Pubkey,
        username: String,
    },
}

pub fn process_instruction(ledger: &mut Ledger, ix: Instruction) -> ProgramResult<String> {
    match ix {
        Instruction::CreateAccount {
            payer,
            new_account,
            lamports,
        } => create_account(ledger, payer, new_account, lamports),
        Instruction::Transfer { from, to, lamports } => transfer(ledger, from, to, lamports),
        Instruction::InitializeProfile { owner, username } => {
            initialize_profile(ledger, owner, username)
        }
    }
}

fn create_account(
    ledger: &mut Ledger,
    payer: Pubkey,
    new_account: Pubkey,
    lamports: u64,
) -> ProgramResult<String> {
    if ledger.get(&new_account).is_some() {
        return Err(ProgramError::AccountAlreadyExists(new_account));
    }
    debit(ledger, &payer, lamports)?;
    ledger.insert(new_account, Account::new(lamports, payer));
    Ok(format!(
        "created account {new_account} with {lamports} lamports (owner = {payer})"
    ))
}

fn transfer(ledger: &mut Ledger, from: Pubkey, to: Pubkey, lamports: u64) -> ProgramResult<String> {
    debit(ledger, &from, lamports)?;
    match ledger.get_mut(&to) {
        Some(account) => account.lamports += lamports,
        None => {
            ledger.insert(to, Account::new(lamports, from));
        }
    }
    Ok(format!("transferred {lamports} lamports from {from} to {to}"))
}

fn initialize_profile(
    ledger: &mut Ledger,
    owner: Pubkey,
    username: String,
) -> ProgramResult<String> {
    let owner_account = ledger
        .get(&owner)
        .ok_or(ProgramError::AccountNotFound(owner))?;
    if owner_account.lamports == 0 {
        return Err(ProgramError::InsufficientFunds {
            have: 0,
            need: 1,
        });
    }

    let (pda, bump) = find_program_address(&[b"profile", owner.as_bytes()], &ledger.program_id);
    if ledger.get(&pda).is_some() {
        return Err(ProgramError::AccountAlreadyExists(pda));
    }

    let profile = Profile { owner, username };
    let mut account = Account::new(0, ledger.program_id);
    account.data = profile.pack();
    ledger.insert(pda, account);

    Ok(format!(
        "profile PDA {pda} (bump {bump}) initialized for {owner}"
    ))
}

fn debit(ledger: &mut Ledger, pubkey: &Pubkey, amount: u64) -> ProgramResult<()> {
    let account = ledger
        .get_mut(pubkey)
        .ok_or(ProgramError::AccountNotFound(*pubkey))?;
    if account.lamports < amount {
        return Err(ProgramError::InsufficientFunds {
            have: account.lamports,
            need: amount,
        });
    }
    account.lamports -= amount;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ledger::Ledger;

    #[test]
    fn transfer_moves_lamports() {
        let mut ledger = Ledger::default();
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        ledger.airdrop(a, 100);
        process_instruction(
            &mut ledger,
            Instruction::Transfer {
                from: a,
                to: b,
                lamports: 40,
            },
        )
        .unwrap();
        assert_eq!(ledger.get(&a).unwrap().lamports, 60);
        assert_eq!(ledger.get(&b).unwrap().lamports, 40);
    }

    #[test]
    fn create_account_moves_rent() {
        let mut ledger = Ledger::default();
        let payer = Pubkey::new_unique();
        let newbie = Pubkey::new_unique();
        ledger.airdrop(payer, 50);
        process_instruction(
            &mut ledger,
            Instruction::CreateAccount {
                payer,
                new_account: newbie,
                lamports: 20,
            },
        )
        .unwrap();
        assert_eq!(ledger.get(&payer).unwrap().lamports, 30);
        assert_eq!(ledger.get(&newbie).unwrap().lamports, 20);
    }

    #[test]
    fn transfer_fails_without_funds() {
        let mut ledger = Ledger::default();
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        ledger.airdrop(a, 10);
        let err = process_instruction(
            &mut ledger,
            Instruction::Transfer {
                from: a,
                to: b,
                lamports: 11,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ProgramError::InsufficientFunds { .. }));
    }
}
