#define _POSIX_C_SOURCE 200809L
#include <libsecret/secret.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "credential-input.h"

static const SecretSchema schema = {
  "dev.typesafe.realtime-review-tool", SECRET_SCHEMA_NONE,
  {
    { "application", SECRET_SCHEMA_ATTRIBUTE_STRING },
    { "account", SECRET_SCHEMA_ATTRIBUTE_STRING },
    { NULL, 0 },
  },
  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL
};

static GHashTable *attributes(void) {
  GHashTable *result = g_hash_table_new(g_str_hash, g_str_equal);
  g_hash_table_insert(result, "application", "realtime-review-tool");
  g_hash_table_insert(result, "account", "default");
  return result;
}

static void json_status(const char *status) {
  printf("{\"version\":1,\"status\":\"%s\"}\n", status);
}

static void failure(GError *error) {
  (void)error;
  json_status("unavailable");
}

static SecretService *service(GError **error) {
  return secret_service_get_sync(
    SECRET_SERVICE_OPEN_SESSION | SECRET_SERVICE_LOAD_COLLECTIONS,
    NULL,
    error
  );
}

static GList *find_items(SecretService *svc, GError **error) {
  GHashTable *attrs = attributes();
  /* ALL includes locked matches. LOAD_SECRETS does not unlock or prompt. */
  GList *items = secret_service_search_sync(
    svc,
    &schema,
    attrs,
    SECRET_SEARCH_ALL | SECRET_SEARCH_LOAD_SECRETS,
    NULL,
    error
  );
  g_hash_table_unref(attrs);
  return items;
}

static int probe(void) {
  GError *error = NULL;
  SecretService *svc = service(&error);
  if (svc == NULL) { failure(error); g_clear_error(&error); return 2; }
  SecretCollection *collection = secret_collection_for_alias_sync(
    svc, SECRET_COLLECTION_DEFAULT, SECRET_COLLECTION_NONE, NULL, &error
  );
  if (collection == NULL) {
    failure(error);
    g_clear_error(&error);
    g_object_unref(svc);
    return 2;
  }
  json_status(secret_collection_get_locked(collection) ? "locked" : "available");
  g_object_unref(collection);
  g_object_unref(svc);
  return 0;
}

static int get_secret(void) {
  GError *error = NULL;
  SecretService *svc = service(&error);
  if (svc == NULL) { failure(error); g_clear_error(&error); return 2; }
  GList *items = find_items(svc, &error);
  if (error != NULL) {
    failure(error); g_clear_error(&error); g_object_unref(svc); return 2;
  }
  if (items == NULL) { json_status("missing"); g_object_unref(svc); return 0; }
  SecretItem *item = SECRET_ITEM(items->data);
  if (secret_item_get_locked(item)) {
    json_status("locked");
  } else {
    SecretValue *value = secret_item_get_secret(item);
    const gchar *text = value == NULL ? NULL : secret_value_get_text(value);
    if (text == NULL || text[0] == '\0') json_status("invalid");
    else {
      size_t length = strlen(text);
      printf("{\"version\":1,\"status\":\"present\",\"length\":%zu}\n", length);
      fwrite(text, 1, length, stdout);
    }
  }
  g_list_free_full(items, g_object_unref);
  g_object_unref(svc);
  return 0;
}

static int set_secret(void) {
  size_t length = 0;
  char *input = credential_read_stdin(&length);
  if (input == NULL || length == 0) { credential_secure_free(input, length); json_status("invalid"); return 2; }
  GError *error = NULL;
  SecretService *svc = service(&error);
  if (svc == NULL) { failure(error); g_clear_error(&error); credential_secure_free(input, length); return 2; }
  SecretCollection *collection = secret_collection_for_alias_sync(
    svc, SECRET_COLLECTION_DEFAULT, SECRET_COLLECTION_NONE, NULL, &error
  );
  if (collection == NULL) {
    failure(error); g_clear_error(&error); g_object_unref(svc); credential_secure_free(input, length); return 2;
  }
  if (secret_collection_get_locked(collection)) {
    json_status("locked");
    g_object_unref(collection); g_object_unref(svc); credential_secure_free(input, length); return 2;
  }
  GHashTable *attrs = attributes();
  SecretValue *value = secret_value_new(input, (gssize)length, "text/plain");
  SecretItem *item = secret_item_create_sync(
    collection, &schema, attrs, "Realtime review credential", value,
    SECRET_ITEM_CREATE_REPLACE, NULL, &error
  );
  secret_value_unref(value);
  g_hash_table_unref(attrs);
  credential_secure_free(input, length);
  if (item == NULL) {
    /* The service may have committed the replacement before returning an error. */
    json_status("indeterminate");
    g_clear_error(&error); g_object_unref(collection); g_object_unref(svc); return 2;
  }
  json_status("stored");
  g_object_unref(item); g_object_unref(collection); g_object_unref(svc);
  return 0;
}

static int delete_secret(void) {
  GError *error = NULL;
  SecretService *svc = service(&error);
  if (svc == NULL) { failure(error); g_clear_error(&error); return 2; }
  GList *items = find_items(svc, &error);
  if (error != NULL) { failure(error); g_clear_error(&error); g_object_unref(svc); return 2; }
  if (items == NULL) { json_status("missing"); g_object_unref(svc); return 0; }
  for (GList *cursor = items; cursor != NULL; cursor = cursor->next) {
    SecretItem *item = SECRET_ITEM(cursor->data);
    if (secret_item_get_locked(item)) {
      json_status("locked"); g_list_free_full(items, g_object_unref); g_object_unref(svc); return 2;
    }
    if (!secret_item_delete_sync(item, NULL, &error)) {
      failure(error); g_clear_error(&error); g_list_free_full(items, g_object_unref); g_object_unref(svc); return 2;
    }
  }
  json_status("deleted");
  g_list_free_full(items, g_object_unref); g_object_unref(svc);
  return 0;
}

/* Conformance-only operation used inside a disposable login collection. */
static int lock_collection(void) {
  GError *error = NULL;
  SecretService *svc = service(&error);
  if (svc == NULL) { failure(error); g_clear_error(&error); return 2; }
  SecretCollection *collection = secret_collection_for_alias_sync(
    svc, SECRET_COLLECTION_DEFAULT, SECRET_COLLECTION_NONE, NULL, &error
  );
  if (collection == NULL) {
    failure(error); g_clear_error(&error); g_object_unref(svc); return 2;
  }
  GList one = { collection, NULL, NULL };
  GList *locked = NULL;
  gint count = secret_service_lock_sync(svc, &one, NULL, &locked, &error);
  if (count < 1 || error != NULL) {
    failure(error); g_clear_error(&error); g_list_free(locked);
    g_object_unref(collection); g_object_unref(svc); return 2;
  }
  g_list_free(locked);
  json_status("locked");
  g_object_unref(collection); g_object_unref(svc);
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 2 || argc > 3 ||
      (argc == 3 && strcmp(argv[2], "--allow-interaction") != 0)) {
    json_status("invalid"); return 2;
  }
  if (strcmp(argv[1], "probe") == 0) return probe();
  if (strcmp(argv[1], "get") == 0) return get_secret();
  if (strcmp(argv[1], "set") == 0) return set_secret();
  if (strcmp(argv[1], "delete") == 0) return delete_secret();
  if (strcmp(argv[1], "lock") == 0) return lock_collection();
  json_status("invalid");
  return 2;
}
