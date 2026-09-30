mod account;
mod error;
mod instruction;
mod ledger;
mod pda;
mod pubkey;

use std::str::FromStr;

use clap::{Parser, Subcommand};

use crate::error::ProgramResult;
use crate::instruction::{process_instruction, Instruction};
use crate::ledger::Ledger;
use crate::pda::find_program_address;
use crate::pubkey::Pubkey;

#[derive(Parser)]
#[command(
    name = "week3-solana-cli",
    about = "Неделя 3: Rust CLI с конструкциями Solana (Pubkey, Instruction, PDA, Result)"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a new 32-byte keypair address (base58)
    Keygen,
    /// Credit lamports to an account (local faucet)
    Airdrop { pubkey: String, lamports: u64 },
    /// Fund a new account from a payer (Solana-style CreateAccount)
    CreateAccount {
        payer: String,
        new_account: String,
        lamports: u64,
    },
    /// Transfer lamports between accounts
    Transfer {
        from: String,
        to: String,
        lamports: u64,
    },
    /// Show account lamports
    Balance { pubkey: String },
    /// List all local accounts
    Accounts,
    /// Derive a program address from seeds (like Solana PDA)
    Pda {
        #[arg(long, num_args = 1..)]
        seeds: Vec<String>,
        #[arg(long)]
        program: Option<String>,
    },
    /// SOL → lamports (1 SOL = 1_000_000_000)
    Convert { sol: f64 },
    /// Check Base58 pubkey is 32 bytes
    CheckAddress { address: String },
    /// On-chain style profile stored at PDA("profile" + owner)
    #[command(subcommand)]
    Profile(ProfileCmd),
}

#[derive(Subcommand)]
enum ProfileCmd {
    Init { owner: String, username: String },
    Show { owner: String },
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run() -> ProgramResult<()> {
    let cli = Cli::parse();
    let path = Ledger::path();
    let mut ledger = Ledger::load(&path)?;

    match cli.command {
        Commands::Keygen => {
            let pk = Pubkey::new_unique();
            println!("{pk}");
            println!("bytes: {}", hex::encode(pk.as_bytes()));
        }
        Commands::Airdrop { pubkey, lamports } => {
            let pk = Pubkey::from_str(&pubkey)?;
            ledger.airdrop(pk, lamports);
            ledger.save(&path)?;
            println!("airdropped {lamports} lamports to {pk}");
            println!("balance: {}", ledger.get(&pk).unwrap().lamports);
        }
        Commands::CreateAccount {
            payer,
            new_account,
            lamports,
        } => {
            let ix = Instruction::CreateAccount {
                payer: Pubkey::from_str(&payer)?,
                new_account: Pubkey::from_str(&new_account)?,
                lamports,
            };
            let msg = process_instruction(&mut ledger, ix)?;
            ledger.save(&path)?;
            println!("{msg}");
        }
        Commands::Transfer {
            from,
            to,
            lamports,
        } => {
            let ix = Instruction::Transfer {
                from: Pubkey::from_str(&from)?,
                to: Pubkey::from_str(&to)?,
                lamports,
            };
            let msg = process_instruction(&mut ledger, ix)?;
            ledger.save(&path)?;
            println!("{msg}");
        }
        Commands::Balance { pubkey } => {
            let pk = Pubkey::from_str(&pubkey)?;
            match ledger.get(&pk) {
                Some(account) => println!("{} lamports (owner {})", account.lamports, account.owner),
                None => println!("account not found"),
            }
        }
        Commands::Accounts => {
            if ledger.accounts.is_empty() {
                println!("ledger is empty — run `keygen` then `airdrop`");
                return Ok(());
            }
            for (pk, account) in &ledger.accounts {
                let extra = if account.data.is_empty() {
                    String::new()
                } else {
                    format!(" data={}B", account.data.len())
                };
                println!("{pk}  {} lamports{extra}", account.lamports);
            }
        }
        Commands::Pda { seeds, program } => {
            let program_id = match program {
                Some(s) => Pubkey::from_str(&s)?,
                None => ledger.program_id,
            };
            let seed_bytes: Vec<Vec<u8>> = seeds.iter().map(|s| s.as_bytes().to_vec()).collect();
            let refs: Vec<&[u8]> = seed_bytes.iter().map(|s| s.as_slice()).collect();
            let (pda, bump) = find_program_address(&refs, &program_id);
            println!("pda:  {pda}");
            println!("bump: {bump}");
            println!("program: {program_id}");
        }
        Commands::Convert { sol } => {
            let lamports = (sol * 1_000_000_000.0) as u64;
            println!("{sol} SOL = {lamports} lamports");
        }
        Commands::CheckAddress { address } => {
            let pk = Pubkey::from_str(&address)?;
            println!("ok, 32 bytes");
            println!("{pk}");
            println!("hex {}", hex::encode(pk.as_bytes()));
        }
        Commands::Profile(ProfileCmd::Init { owner, username }) => {
            let ix = Instruction::InitializeProfile {
                owner: Pubkey::from_str(&owner)?,
                username,
            };
            let msg = process_instruction(&mut ledger, ix)?;
            ledger.save(&path)?;
            println!("{msg}");
        }
        Commands::Profile(ProfileCmd::Show { owner }) => {
            let owner_pk = Pubkey::from_str(&owner)?;
            let (pda, bump) =
                find_program_address(&[b"profile", owner_pk.as_bytes()], &ledger.program_id);
            match ledger.profile_at(&pda) {
                Some(profile) => {
                    println!("pda:      {pda}");
                    println!("bump:     {bump}");
                    println!("owner:    {}", profile.owner);
                    println!("username: {}", profile.username);
                }
                None => println!("profile not found at {pda}"),
            }
        }
    }

    Ok(())
}
