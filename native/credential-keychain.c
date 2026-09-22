#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "credential-input.h"

static const CFStringRef service_name = CFSTR("dev.typesafe.realtime-review-tool");
static const CFStringRef account_name = CFSTR("default");

static void json_status(const char *status) {
  printf("{\"version\":1,\"status\":\"%s\"}\n", status);
}

static CFMutableDictionaryRef identity_query(void) {
  CFMutableDictionaryRef query = CFDictionaryCreateMutable(
    kCFAllocatorDefault, 0,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  );
  if (query == NULL) return NULL;
  CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
  CFDictionarySetValue(query, kSecAttrService, service_name);
  CFDictionarySetValue(query, kSecAttrAccount, account_name);
  return query;
}

static SecKeychainRef default_keychain(void) {
  SecKeychainRef keychain = NULL;
  if (SecKeychainCopyDefault(&keychain) != errSecSuccess || keychain == NULL) {
    return NULL;
  }
  return keychain;
}

static Boolean scope_matching_query(CFMutableDictionaryRef query) {
  SecKeychainRef keychain = default_keychain();
  if (keychain == NULL) return false;
  const void *values[] = { keychain };
  CFArrayRef search_list = CFArrayCreate(
    kCFAllocatorDefault, values, 1, &kCFTypeArrayCallBacks
  );
  CFRelease(keychain);
  if (search_list == NULL) return false;
  CFDictionarySetValue(query, kSecMatchSearchList, search_list);
  CFRelease(search_list);
  return true;
}

static Boolean scope_add_query(CFMutableDictionaryRef query) {
  SecKeychainRef keychain = default_keychain();
  if (keychain == NULL) return false;
  CFDictionarySetValue(query, kSecUseKeychain, keychain);
  CFRelease(keychain);
  return true;
}

static const char *lookup_failure(OSStatus status) {
  if (status == errSecItemNotFound) return "missing";
  if (status == errSecInteractionNotAllowed || status == errSecInteractionRequired ||
      status == errSecUserCanceled) {
    return "interaction-required";
  }
  if (status == errSecAuthFailed) return "locked";
  return "unavailable";
}

static OSStatus copy_secret(Boolean allow_interaction, CFDataRef *secret) {
  CFMutableDictionaryRef query = identity_query();
  if (query == NULL || !scope_matching_query(query)) {
    if (query != NULL) CFRelease(query);
    return errSecAllocate;
  }
  CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
  CFDictionarySetValue(
    query,
    kSecUseAuthenticationUI,
    allow_interaction ? kSecUseAuthenticationUIAllow : kSecUseAuthenticationUIFail
  );
  OSStatus status = SecItemCopyMatching(query, (CFTypeRef *)secret);
  CFRelease(query);
  return status;
}

static int probe(Boolean allow_interaction) {
  CFDataRef secret = NULL;
  OSStatus status = copy_secret(allow_interaction, &secret);
  if (secret != NULL) CFRelease(secret);
  if (status == errSecSuccess || status == errSecItemNotFound) {
    json_status("available");
    return 0;
  }
  json_status(lookup_failure(status));
  return 2;
}

static int get_secret(void) {
  CFDataRef secret = NULL;
  OSStatus status = copy_secret(false, &secret);
  if (status != errSecSuccess || secret == NULL) {
    if (secret != NULL) CFRelease(secret);
    json_status(lookup_failure(status));
    return status == errSecItemNotFound ? 0 : 2;
  }
  CFIndex length = CFDataGetLength(secret);
  if (length <= 0 || length > 32768) {
    CFRelease(secret);
    json_status("invalid");
    return 2;
  }
  printf("{\"version\":1,\"status\":\"present\",\"length\":%ld}\n", (long)length);
  fwrite(CFDataGetBytePtr(secret), 1, (size_t)length, stdout);
  CFRelease(secret);
  return 0;
}

static int set_secret(void) {
  size_t length = 0;
  char *input = credential_read_stdin(&length);
  if (input == NULL || length == 0) {
    credential_secure_free(input, length);
    json_status("invalid");
    return 2;
  }
  CFDataRef value = CFDataCreate(kCFAllocatorDefault, (const UInt8 *)input, (CFIndex)length);
  if (value == NULL) {
    credential_secure_free(input, length);
    json_status("unavailable");
    return 2;
  }

  CFMutableDictionaryRef query = identity_query();
  CFMutableDictionaryRef changes = CFDictionaryCreateMutable(
    kCFAllocatorDefault, 0,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  );
  if (query == NULL || changes == NULL || !scope_matching_query(query)) {
    if (query != NULL) CFRelease(query);
    if (changes != NULL) CFRelease(changes);
    CFRelease(value);
    credential_secure_free(input, length);
    json_status("unavailable");
    return 2;
  }
  CFDictionarySetValue(changes, kSecValueData, value);
  CFDictionarySetValue(changes, kSecAttrLabel, CFSTR("Realtime review credential"));
  OSStatus status = SecItemUpdate(query, changes);
  if (status == errSecItemNotFound) {
    CFMutableDictionaryRef add = identity_query();
    if (add == NULL || !scope_add_query(add)) {
      if (add != NULL) CFRelease(add);
      status = errSecAllocate;
    } else {
      CFDictionarySetValue(add, kSecValueData, value);
      CFDictionarySetValue(add, kSecAttrLabel, CFSTR("Realtime review credential"));
      CFDictionarySetValue(add, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlock);
      status = SecItemAdd(add, NULL);
      CFRelease(add);
    }
  }
  CFRelease(changes);
  CFRelease(query);
  CFRelease(value);
  credential_secure_free(input, length);
  if (status != errSecSuccess) {
    /* Update/add can commit before a transport failure becomes visible. */
    json_status(status == errSecInteractionNotAllowed || status == errSecInteractionRequired ||
      status == errSecUserCanceled
      ? "interaction-required" : "indeterminate");
    return 2;
  }
  json_status("stored");
  return 0;
}

static int delete_secret(void) {
  CFMutableDictionaryRef query = identity_query();
  if (query == NULL || !scope_matching_query(query)) {
    if (query != NULL) CFRelease(query);
    json_status("unavailable"); return 2;
  }
  OSStatus status = SecItemDelete(query);
  CFRelease(query);
  if (status == errSecSuccess) { json_status("deleted"); return 0; }
  if (status == errSecItemNotFound) { json_status("missing"); return 0; }
  json_status(status == errSecInteractionNotAllowed || status == errSecInteractionRequired ||
    status == errSecUserCanceled
    ? "interaction-required" : "unavailable");
  return 2;
}

int main(int argc, char **argv) {
  if (argc < 2 || argc > 3 ||
      (argc == 3 && strcmp(argv[2], "--allow-interaction") != 0)) {
    json_status("invalid"); return 2;
  }
  if (strcmp(argv[1], "probe") == 0) return probe(argc == 3);
  if (strcmp(argv[1], "get") == 0) return get_secret();
  if (strcmp(argv[1], "set") == 0) return set_secret();
  if (strcmp(argv[1], "delete") == 0) return delete_secret();
  json_status("invalid");
  return 2;
}
