#include <errno.h>
#include <node_api.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

/* Only a non-waiting lock operation. Node owns opening, validating and closing the descriptor. */
static napi_value lock_directory(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value arguments[2];
  bool shared = false;
  double number;
  if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok || count < 1 ||
      (count == 2 && napi_get_value_bool(env, arguments[1], &shared) != napi_ok) ||
      napi_get_value_double(env, arguments[0], &number) != napi_ok ||
      !(number >= 0 && number <= 2147483647) || number != (double)(int)number) {
    napi_throw_type_error(env, NULL, "inspection descriptor must be a nonnegative integer");
    return NULL;
  }
  int fd = (int)number;
  struct stat status;
  if (fstat(fd, &status) != 0 || !S_ISDIR(status.st_mode) || status.st_uid != getuid() ||
      (status.st_mode & 0077) != 0) {
    napi_throw_error(env, NULL, "inspection storage unavailable");
    return NULL;
  }
  int acquired = flock(fd, (shared ? LOCK_SH : LOCK_EX) | LOCK_NB) == 0;
  if (!acquired && errno != EWOULDBLOCK && errno != EAGAIN && errno != EINTR) {
    napi_throw_error(env, NULL, "inspection storage unavailable");
    return NULL;
  }
  napi_value result;
  if (napi_get_boolean(env, acquired, &result) != napi_ok) return NULL;
  return result;
}

NAPI_MODULE_INIT() {
  napi_value function;
  if (napi_create_function(env, "lockDirectory", NAPI_AUTO_LENGTH, lock_directory, NULL, &function) != napi_ok ||
      napi_set_named_property(env, exports, "lockDirectory", function) != napi_ok) return NULL;
  return exports;
}
