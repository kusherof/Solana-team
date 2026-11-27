//! Выпуск NFT питомца на Token-2022.
//!
//! Mint создаётся Anchor-ом с расширением MetadataPointer, указывающим на сам
//! mint. Здесь мы: доплачиваем ренту под метаданные, записываем имя/символ/URI
//! и дополнительные поля (поколение, ДНК), чеканим 1 токен владельцу и
//! навсегда убираем право чеканки — supply фиксирован = 1.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{
    self, spl_pod::optional_keys::OptionalNonZeroPubkey,
    spl_token_metadata_interface::state::{Field, TokenMetadata},
    token_metadata_initialize, token_metadata_update_field, MintTo, SetAuthority,
    TokenMetadataInitialize, TokenMetadataUpdateField,
};

use crate::constants::*;
pub use anchor_spl::token_interface::spl_token_metadata_interface::state::Field as MetaField;

pub struct NftAccounts<'a, 'info> {
    pub payer: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    pub owner_token: &'a AccountInfo<'info>,
    pub config: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

/// Видимые гены (первые 8 байт) в hex — 16 символов.
pub fn dna_hex(dna: &[u8; 32]) -> String {
    dna[..8].iter().map(|b| format!("{:02x}", b)).collect()
}

/// Пока яйцо не вылупилось, ДНК ещё не известна.
pub const DNA_PLACEHOLDER: &str = "????????????????";

/// Доплатить ренту, если аккаунт вырастет до `new_len` байт.
pub fn top_up_rent<'info>(
    payer: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    new_len: usize,
) -> Result<()> {
    let need = Rent::get()?.minimum_balance(new_len);
    let have = account.lamports();
    if need > have {
        system_program::transfer(
            CpiContext::new(
                system_program.clone(),
                system_program::Transfer {
                    from: payer.clone(),
                    to: account.clone(),
                },
            ),
            need - have,
        )?;
    }
    Ok(())
}

pub fn mint_pet_nft<'info>(
    a: NftAccounts<'_, 'info>,
    config_bump: u8,
    name: String,
    generation: u16,
) -> Result<()> {
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config_bump]];
    let signer = &[seeds];

    let gen_s = generation.to_string();
    let dna_s = DNA_PLACEHOLDER.to_string();
    let meta = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(a.config.key()))?,
        mint: a.mint.key(),
        name: name.clone(),
        symbol: NFT_SYMBOL.to_string(),
        uri: NFT_URI.to_string(),
        additional_metadata: vec![
            ("generation".to_string(), gen_s.clone()),
            ("dna".to_string(), dna_s.clone()),
        ],
    };
    let new_len = a.mint.data_len() + meta.tlv_size_of()?;
    top_up_rent(a.payer, a.mint, a.system_program, new_len)?;

    token_metadata_initialize(
        CpiContext::new_with_signer(
            a.token_program.clone(),
            TokenMetadataInitialize {
                program_id: a.token_program.clone(),
                metadata: a.mint.clone(),
                update_authority: a.config.clone(),
                mint_authority: a.config.clone(),
                mint: a.mint.clone(),
            },
            signer,
        ),
        name,
        NFT_SYMBOL.to_string(),
        NFT_URI.to_string(),
    )?;

    for (k, v) in [("generation", gen_s), ("dna", dna_s)] {
        token_metadata_update_field(
            CpiContext::new_with_signer(
                a.token_program.clone(),
                TokenMetadataUpdateField {
                    program_id: a.token_program.clone(),
                    metadata: a.mint.clone(),
                    update_authority: a.config.clone(),
                },
                signer,
            ),
            Field::Key(k.to_string()),
            v,
        )?;
    }

    token_interface::mint_to(
        CpiContext::new_with_signer(
            a.token_program.clone(),
            MintTo {
                mint: a.mint.clone(),
                to: a.owner_token.clone(),
                authority: a.config.clone(),
            },
            signer,
        ),
        1,
    )?;

    token_interface::set_authority(
        CpiContext::new_with_signer(
            a.token_program.clone(),
            SetAuthority {
                current_authority: a.config.clone(),
                account_or_mint: a.mint.clone(),
            },
            signer,
        ),
        AuthorityType::MintTokens,
        None,
    )?;
    Ok(())
}

/// Обновить одно поле метаданных NFT, доплатив ренту за прирост длины.
#[allow(clippy::too_many_arguments)]
pub fn update_nft_field<'info>(
    payer: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    config: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    config_bump: u8,
    field: Field,
    value: String,
    old_len: usize,
) -> Result<()> {
    let grow = value.len().saturating_sub(old_len);
    top_up_rent(payer, mint, system_program, mint.data_len() + grow)?;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config_bump]];
    token_metadata_update_field(
        CpiContext::new_with_signer(
            token_program.clone(),
            TokenMetadataUpdateField {
                program_id: token_program.clone(),
                metadata: mint.clone(),
                update_authority: config.clone(),
            },
            &[seeds],
        ),
        field,
        value,
    )
}
