use std::io::{self, Write};

const LAMPORTS_PER_SOL: f64 = 1_000_000_000.0;
const BASE58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

fn is_solana_address(s: &str) -> Result<(), String> {
    let s = s.trim();
    if s.len() < 32 || s.len() > 44 {
        return Err(format!(
            "длина {} символов, у адреса Solana обычно 32–44",
            s.len()
        ));
    }
    if !s.bytes().all(|b| BASE58.contains(&b)) {
        return Err("есть символы не из Base58 (0, O, I, l запрещены)".into());
    }
    Ok(())
}

fn read_line(prompt: &str) -> String {
    print!("{prompt}");
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin()
        .read_line(&mut input)
        .expect("Ошибка чтения строки");
    input
}

fn main() {
    println!("==========================================");
    println!("   Solana CLI Utility - AlmaU Week 3      ");
    println!("==========================================");

    let input = read_line("Введите количество SOL для конвертации в Lamports: ");

    match input.trim().parse::<f64>() {
        Ok(sol) if sol >= 0.0 => {
            let lamports = (sol * LAMPORTS_PER_SOL) as u64;
            println!("\n[Результат конвертации]");
            println!("{} SOL = {} Lamports", sol, lamports);
            println!("(в Solana 1 SOL = 1_000_000_000 Lamports)");
        }
        _ => {
            println!("Ошибка: введите корректное число!");
        }
    }

    let addr = read_line("\nВведите адрес Solana (pubkey), чтобы проверить структуру: ");
    let addr = addr.trim();
    match is_solana_address(addr) {
        Ok(()) => {
            println!("\n[Проверка адреса]");
            println!("OK: похоже на pubkey Solana (Base58, длина {})", addr.len());
        }
        Err(reason) => {
            println!("\n[Проверка адреса]");
            println!("НЕ OK: {reason}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_sol_is_tx_amount() {
        let lamports = (0.2 * LAMPORTS_PER_SOL) as u64;
        assert_eq!(lamports, 200_000_000);
    }

    #[test]
    fn real_wallet_looks_valid() {
        assert!(is_solana_address("2z22P3J5qoaARXeq1XVbioptY1MFYP4PURW4N97KwiMN").is_ok());
    }

    #[test]
    fn bad_address_rejected() {
        assert!(is_solana_address("hello").is_err());
        assert!(is_solana_address("000").is_err());
    }
}
