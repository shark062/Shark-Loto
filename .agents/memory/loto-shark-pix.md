---
name: PIX payload e CRC16
description: Como calcular o payload PIX correto ao mudar nome/dados
---

## Regra
Qualquer mudança no nome do beneficiário ou dados do PIX exige recálculo do CRC16-CCITT.

**Why:** O payload PIX EMV tem checksum nos últimos 4 chars. Payload inválido é rejeitado pelo app de banco.

**How to apply:** Use o código JavaScript:
```js
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
// base = payload completo incluindo "6304" no final, sem os 4 chars do CRC
```

## Estado atual (Alex Sousa)
- Chave PIX: `5d237461-0a79-4ff3-9c8d-40afadf909b1`
- Nome no payload: `ALEX SOUSA` (10 chars → campo `5910ALEX SOUSA`)
- CRC16: `C7B4`
- Arquivo: `artifacts/loto-shark/src/pages/Sobre.tsx`
