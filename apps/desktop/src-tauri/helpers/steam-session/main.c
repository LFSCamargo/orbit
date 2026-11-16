/* Unwrap the Steam browser's OS key and authenticate one v10 cookie using
 * Windows' own DPAPI and AES-GCM inside the existing Wine prefix. All secret
 * input/output uses private pipes; nothing is logged or written to disk. */
#include <windows.h>
#include <wincrypt.h>
#include <bcrypt.h>
#include "hex.h"
static unsigned char input[32768], wrapped[8192], cookie[8192], plain[8192];
int main(void) {
    DWORD used = 0, read = 0;
    while (used < sizeof(input) && ReadFile(GetStdHandle(STD_INPUT_HANDLE), input + used, sizeof(input) - used, &read, NULL) && read) used += read;
    if (!used || used == sizeof(input)) return 2;
    DWORD split = 0;
    while (split < used && input[split] != '\n') ++split;
    if (split == used || !decode_hex(input, split, wrapped, sizeof(wrapped)) ||
        !decode_hex(input + split + 1, used - split - 1, cookie, sizeof(cookie))) return 2;
    DWORD cookie_size = (used - split - 1) / 2;
    if (cookie_size < 31 || cookie[0] != 'v' || cookie[1] != '1' || cookie[2] != '0') return 2;
    DATA_BLOB source = {split / 2, wrapped}, key = {0, NULL};
    if (!CryptUnprotectData(&source, NULL, NULL, NULL, NULL, CRYPTPROTECT_UI_FORBIDDEN, &key)) return 3;
    BCRYPT_ALG_HANDLE algorithm = NULL;
    BCRYPT_KEY_HANDLE handle = NULL;
    NTSTATUS status = -1;
    DWORD length = 0, written = 0;
    int result = 4;
    if (key.cbData != 32 || BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_AES_ALGORITHM, NULL, 0) < 0) goto cleanup;
    if (BCryptSetProperty(algorithm, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0) < 0) goto cleanup;
    if (BCryptGenerateSymmetricKey(algorithm, &handle, NULL, 0, key.pbData, key.cbData, 0) < 0) goto cleanup;
    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO auth;
    BCRYPT_INIT_AUTH_MODE_INFO(auth);
    auth.pbNonce = cookie + 3;
    auth.cbNonce = 12;
    auth.pbTag = cookie + cookie_size - 16;
    auth.cbTag = 16;
    status = BCryptDecrypt(handle, cookie + 15, cookie_size - 31, &auth, NULL, 0, plain, sizeof(plain), &length, 0);
    if (status < 0 || !length) goto cleanup;
    if (WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), plain, length, &written, NULL) && written == length) result = 0;
cleanup:
    if (handle) BCryptDestroyKey(handle);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    SecureZeroMemory(key.pbData, key.cbData);
    LocalFree(key.pbData);
    SecureZeroMemory(input, sizeof(input));
    SecureZeroMemory(wrapped, sizeof(wrapped));
    SecureZeroMemory(cookie, sizeof(cookie));
    SecureZeroMemory(plain, sizeof(plain));
    return result;
}
