"""Resolve Earthdata credentials without exposing them in diagnostics."""

from getpass import GetPassWarning, getpass
import os
import re
import sys
import warnings

SERVICE = "quant-alpha-agro"
ACCOUNT = "earthdata"


class CredentialError(ValueError):
    """A credential problem whose message is safe to display."""


def windows_token():
    if sys.platform != "win32":
        return None
    try:
        from keyring.backends.Windows import WinVaultKeyring

        return WinVaultKeyring().get_password(SERVICE, ACCOUNT)
    except Exception:
        # The OS/backend may be unavailable. Its exception is not safe to report.
        return None


def earthdata_token(*, prompt=False, prompt_if_missing=False):
    """Use the environment, Windows vault, or hidden input, in that order."""
    token = None if prompt else os.getenv("EARTHDATA_TOKEN") or windows_token()
    if prompt or (not token and prompt_if_missing and sys.stdin.isatty()):
        if not sys.stdin.isatty():
            raise CredentialError("--prompt-token requires an interactive terminal.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", GetPassWarning)
            try:
                token = getpass("Earthdata user token: ").strip()
            except GetPassWarning:
                raise CredentialError("Cannot hide input in this terminal.") from None
            except (EOFError, KeyboardInterrupt):
                raise CredentialError("Earthdata token entry canceled.") from None
        if not token:
            raise CredentialError("The Earthdata token prompt was empty.")
    if token and re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token) is None:
        raise CredentialError("The Earthdata token contains unexpected characters.")
    return token or None


def main():
    """Store a token locally using the same hidden prompt as acquisition."""
    if sys.platform != "win32" or len(sys.argv) != 1:
        print("Run python -m gldas.auth without arguments in a Windows terminal.", file=sys.stderr)
        return 2
    try:
        token = earthdata_token(prompt=True)
    except CredentialError as error:
        print(error, file=sys.stderr)
        return 2
    try:
        from keyring.backends.Windows import WinVaultKeyring

        vault = WinVaultKeyring()
        vault.persist = "local machine"
        vault.set_password(SERVICE, ACCOUNT, token)
    except Exception:
        print("Windows Credential Manager could not save the Earthdata credential.", file=sys.stderr)
        return 1
    print("Earthdata credential saved in Windows Credential Manager.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
