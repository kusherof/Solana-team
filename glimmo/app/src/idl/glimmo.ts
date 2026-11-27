/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/glimmo.json`.
 */
export type Glimmo = {
  "address": "HSKLQX3Q8pwhn8gJfgDvHjVwyBV5DgGqVGCFicUuxdeX",
  "metadata": {
    "name": "glimmo",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Glimmo: светящиеся питомцы на Solana (NFT Token-2022, еда SPL, скрещивание генов)"
  },
  "instructions": [
    {
      "name": "adoptEgg",
      "docs": [
        "Купить яйцо: оплата в казну, выпуск NFT (Token-2022) и случайная ДНК."
      ],
      "discriminator": [
        231,
        166,
        11,
        250,
        84,
        40,
        187,
        101
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "petMint",
          "docs": [
            "NFT питомца: Token-2022 mint, метаданные хранятся в нём самом."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.total_pets",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "petToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "petMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "pet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "petMint"
              }
            ]
          }
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "breed",
      "docs": [
        "Скрестить двух взрослых питомцев (можно двух разных игроков): новое яйцо",
        "с генами от обоих родителей и шансом мутации."
      ],
      "discriminator": [
        215,
        166,
        48,
        89,
        209,
        205,
        125,
        11
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "partner",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "parentA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "parent_a.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "parentAToken"
        },
        {
          "name": "parentB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "parent_b.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "parentBToken"
        },
        {
          "name": "foodMint",
          "writable": true
        },
        {
          "name": "ownerFood",
          "writable": true
        },
        {
          "name": "childMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.total_pets",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "childToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "childMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "childMint"
              }
            ]
          }
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "claimFood",
      "docs": [
        "Получить порцию еды FOOD из «кормушки» (не чаще, чем раз в food_cooldown)."
      ],
      "discriminator": [
        107,
        77,
        133,
        165,
        119,
        205,
        112,
        19
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "foodMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  111,
                  111,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "ownerFood",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "foodMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "feed",
      "docs": [
        "Покормить питомца: сжигается `amount` FOOD."
      ],
      "discriminator": [
        46,
        213,
        237,
        176,
        190,
        113,
        182,
        94
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pet.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "petToken"
        },
        {
          "name": "foodMint",
          "writable": true
        },
        {
          "name": "ownerFood",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u8"
        }
      ]
    },
    {
      "name": "hatch",
      "docs": [
        "Вылупить питомца, когда истёк таймер яйца."
      ],
      "discriminator": [
        252,
        228,
        210,
        2,
        100,
        135,
        229,
        207
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pet.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "petToken",
          "docs": [
            "Токен-аккаунт владельца с NFT питомца (проверяем, что NFT у него)."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Создать игру: конфиг, mint еды FOOD и казну. Вызывает администратор один раз."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "Казна: PDA без данных, принадлежит System Program и копит SOL за яйца."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "foodMint",
          "docs": [
            "Mint еды FOOD (классический SPL Token), права чеканки у PDA config."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  111,
                  111,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "gameParams"
            }
          }
        }
      ]
    },
    {
      "name": "play",
      "docs": [
        "Поиграть с питомцем: настроение и опыт растут, сытость немного падает."
      ],
      "discriminator": [
        213,
        157,
        193,
        142,
        228,
        56,
        248,
        150
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pet.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "petToken",
          "docs": [
            "Токен-аккаунт владельца с NFT питомца (проверяем, что NFT у него)."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "rename",
      "docs": [
        "Переименовать питомца (меняется и имя NFT в метаданных Token-2022)."
      ],
      "discriminator": [
        98,
        63,
        129,
        146,
        24,
        170,
        185,
        45
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pet.mint",
                "account": "pet"
              }
            ]
          }
        },
        {
          "name": "petToken"
        },
        {
          "name": "petMint",
          "writable": true
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateParams",
      "docs": [
        "Изменить параметры игры (цены, таймеры). Только администратор."
      ],
      "discriminator": [
        108,
        178,
        190,
        95,
        94,
        203,
        116,
        20
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "gameParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawTreasury",
      "docs": [
        "Вывести SOL из казны. Только администратор."
      ],
      "discriminator": [
        40,
        63,
        122,
        158,
        144,
        216,
        83,
        96
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "pet",
      "discriminator": [
        180,
        195,
        178,
        241,
        61,
        123,
        238,
        32
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    }
  ],
  "events": [
    {
      "name": "bred",
      "discriminator": [
        167,
        55,
        195,
        125,
        7,
        151,
        162,
        70
      ]
    },
    {
      "name": "eggAdopted",
      "discriminator": [
        137,
        84,
        84,
        29,
        247,
        74,
        112,
        77
      ]
    },
    {
      "name": "evolved",
      "discriminator": [
        106,
        163,
        160,
        150,
        131,
        201,
        19,
        54
      ]
    },
    {
      "name": "fed",
      "discriminator": [
        123,
        143,
        103,
        16,
        214,
        190,
        110,
        102
      ]
    },
    {
      "name": "foodClaimed",
      "discriminator": [
        115,
        239,
        83,
        182,
        70,
        215,
        80,
        17
      ]
    },
    {
      "name": "hatched",
      "discriminator": [
        19,
        239,
        110,
        239,
        79,
        219,
        18,
        107
      ]
    },
    {
      "name": "levelUp",
      "discriminator": [
        176,
        232,
        67,
        200,
        172,
        112,
        1,
        22
      ]
    },
    {
      "name": "played",
      "discriminator": [
        131,
        196,
        243,
        0,
        54,
        250,
        232,
        133
      ]
    },
    {
      "name": "renamed",
      "discriminator": [
        148,
        232,
        32,
        179,
        231,
        9,
        232,
        103
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badName",
      "msg": "Имя должно быть от 1 до 20 байт"
    },
    {
      "code": 6001,
      "name": "badParams",
      "msg": "Неверные параметры игры"
    },
    {
      "code": 6002,
      "name": "notAdmin",
      "msg": "Только администратор"
    },
    {
      "code": 6003,
      "name": "notOwner",
      "msg": "Вы не владеете этим питомцем"
    },
    {
      "code": 6004,
      "name": "foodCooldown",
      "msg": "Кормушка ещё пуста, приходите позже"
    },
    {
      "code": 6005,
      "name": "eggNotReady",
      "msg": "Яйцо ещё не готово"
    },
    {
      "code": 6006,
      "name": "alreadyHatched",
      "msg": "Питомец уже вылупился"
    },
    {
      "code": 6007,
      "name": "stillEgg",
      "msg": "Это ещё яйцо"
    },
    {
      "code": 6008,
      "name": "alreadyFull",
      "msg": "Питомец сыт"
    },
    {
      "code": 6009,
      "name": "zeroFood",
      "msg": "Нужно хотя бы 1 FOOD"
    },
    {
      "code": 6010,
      "name": "tooHungry",
      "msg": "Питомец слишком голоден"
    },
    {
      "code": 6011,
      "name": "playCooldown",
      "msg": "Питомец устал, подождите"
    },
    {
      "code": 6012,
      "name": "notAdult",
      "msg": "Для скрещивания нужны два взрослых питомца"
    },
    {
      "code": 6013,
      "name": "samePet",
      "msg": "Нельзя скрестить питомца с самим собой"
    },
    {
      "code": 6014,
      "name": "breedCooldown",
      "msg": "Питомец ещё отдыхает после скрещивания"
    },
    {
      "code": 6015,
      "name": "treasuryEmpty",
      "msg": "Недостаточно средств в казне"
    },
    {
      "code": 6016,
      "name": "overflow",
      "msg": "Арифметическое переполнение"
    }
  ],
  "types": [
    {
      "name": "bred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "parentA",
            "type": "pubkey"
          },
          {
            "name": "parentB",
            "type": "pubkey"
          },
          {
            "name": "child",
            "type": "pubkey"
          },
          {
            "name": "childMint",
            "type": "pubkey"
          },
          {
            "name": "dna",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "generation",
            "type": "u16"
          },
          {
            "name": "mutations",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "foodMint",
            "type": "pubkey"
          },
          {
            "name": "totalPets",
            "type": "u64"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "gameParams"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "foodBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "eggAdopted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "dna",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "hatchAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "evolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "stage",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u8"
          },
          {
            "name": "satiety",
            "type": "u8"
          },
          {
            "name": "mood",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "foodClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameParams",
      "docs": [
        "Параметры игры, которые задаёт администратор."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eggPrice",
            "docs": [
              "Цена яйца в лампортах."
            ],
            "type": "u64"
          },
          {
            "name": "hatchSeconds",
            "docs": [
              "Сколько секунд высиживается яйцо."
            ],
            "type": "i64"
          },
          {
            "name": "decaySeconds",
            "docs": [
              "Раз в сколько секунд сытость и настроение падают на 1."
            ],
            "type": "i64"
          },
          {
            "name": "foodPerClaim",
            "docs": [
              "Сколько FOOD выдаёт кормушка за раз."
            ],
            "type": "u64"
          },
          {
            "name": "foodCooldown",
            "docs": [
              "Пауза между походами к кормушке (сек)."
            ],
            "type": "i64"
          },
          {
            "name": "playCooldown",
            "docs": [
              "Пауза между играми (сек)."
            ],
            "type": "i64"
          },
          {
            "name": "breedCooldown",
            "docs": [
              "Пауза между скрещиваниями для одного питомца (сек)."
            ],
            "type": "i64"
          },
          {
            "name": "breedFoodCost",
            "docs": [
              "Сколько FOOD стоит скрещивание."
            ],
            "type": "u64"
          },
          {
            "name": "xpPerLevel",
            "docs": [
              "Опыт для перехода на следующий уровень = xp_per_level * текущий уровень."
            ],
            "type": "u32"
          },
          {
            "name": "teenLevel",
            "docs": [
              "Уровень, на котором малыш становится подростком."
            ],
            "type": "u8"
          },
          {
            "name": "adultLevel",
            "docs": [
              "Уровень, на котором питомец становится взрослым."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hatched",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "shiny",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "levelUp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "level",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "NFT-mint (Token-2022), владелец которого управляет питомцем."
            ],
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "dna",
            "docs": [
              "32 байта генов, из них рисуется внешность."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "generation",
            "type": "u16"
          },
          {
            "name": "parentA",
            "type": "pubkey"
          },
          {
            "name": "parentB",
            "type": "pubkey"
          },
          {
            "name": "bornAt",
            "type": "i64"
          },
          {
            "name": "hatchAt",
            "type": "i64"
          },
          {
            "name": "hatched",
            "type": "bool"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "xp",
            "type": "u32"
          },
          {
            "name": "satiety",
            "type": "u8"
          },
          {
            "name": "mood",
            "type": "u8"
          },
          {
            "name": "lastTick",
            "docs": [
              "Момент, до которого уже посчитано «проголодание»."
            ],
            "type": "i64"
          },
          {
            "name": "lastPlay",
            "type": "i64"
          },
          {
            "name": "lastBreed",
            "type": "i64"
          },
          {
            "name": "timesFed",
            "type": "u32"
          },
          {
            "name": "timesPlayed",
            "type": "u32"
          },
          {
            "name": "children",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "played",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "satiety",
            "type": "u8"
          },
          {
            "name": "mood",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "lastFoodClaim",
            "type": "i64"
          },
          {
            "name": "eggsAdopted",
            "type": "u32"
          },
          {
            "name": "petsBred",
            "type": "u32"
          },
          {
            "name": "actions",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "renamed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    }
  ]
};
