/**
 * MeuJudi CS — Criptografia AES-256-GCM
 *
 * Usado pra criptografar cookies da sessão PJe antes de salvar em disco.
 * Chave única por máquina (baseada em node-machine-id).
 */

import crypto from 'crypto';
import { machineIdSync } from 'node-machine-id';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;          // 96 bits (recomendado pra GCM)
const AUTH_TAG_LENGTH = 16;    // 128 bits
const SALT = 'meujudi-cs-v1-salt-do-not-change';

/**
 * Gera chave única por máquina. NÃO compartilhar entre PCs.
 */
function getKey(): Buffer {
  const machineId = machineIdSync();
  return crypto.scryptSync(machineId, SALT, 32);
}

/**
 * Criptografa uma string com AES-256-GCM.
 * Formato de saída (base64): IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Descriptografa uma string criptografada com encrypt().
 * Lança erro se o AuthTag não bater (detecta tampering).
 */
export function decrypt(ciphertextB64: string): string {
  const data = Buffer.from(ciphertextB64, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext muito curto (corrompido?)');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Criptografa um objeto (JSON.stringify + encrypt).
 */
export function encryptObject(obj: any): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Descriptografa um objeto (decrypt + JSON.parse).
 */
export function decryptObject<T = any>(ciphertextB64: string): T {
  return JSON.parse(decrypt(ciphertextB64)) as T;
}
