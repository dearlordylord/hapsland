#ifndef REALTIME_REVIEW_CREDENTIAL_INPUT_H
#define REALTIME_REVIEW_CREDENTIAL_INPUT_H

#include <stdio.h>
#include <stdlib.h>

#define CREDENTIAL_MAX_BYTES 32768

static void credential_secure_clear(void *memory, size_t length) {
  volatile unsigned char *cursor = (volatile unsigned char *)memory;
  while (length-- > 0) *cursor++ = 0;
}

static void credential_secure_free(char *value, size_t length) {
  if (value != NULL) credential_secure_clear(value, length);
  free(value);
}

/* Read one byte beyond the inclusive limit so exact-bound input is accepted
 * while limit+1 is rejected without depending on feof timing. */
static char *credential_read_stdin(size_t *length) {
  char *value = malloc(CREDENTIAL_MAX_BYTES + 1);
  if (value == NULL) return NULL;
  *length = 0;
  while (*length <= CREDENTIAL_MAX_BYTES) {
    size_t count = fread(
      value + *length,
      1,
      (CREDENTIAL_MAX_BYTES + 1) - *length,
      stdin
    );
    *length += count;
    if (*length > CREDENTIAL_MAX_BYTES) {
      credential_secure_free(value, *length);
      return NULL;
    }
    if (count == 0) {
      value[*length] = '\0';
      return value;
    }
  }
  credential_secure_free(value, *length);
  return NULL;
}

#endif
