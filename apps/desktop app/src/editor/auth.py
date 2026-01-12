"""Simple authentication helpers for the local PostgreSQL user store.

This module provides a thin wrapper around a local PostgreSQL database
called ``crowdly`` with a ``local_users`` table.

The exact schema of ``local_users`` is not enforced here. In this
project we currently expect the following columns::

    id            UUID PRIMARY KEY
    email         TEXT UNIQUE NOT NULL
    password_hash TEXT NOT NULL

If your schema differs (for example, if you change how passwords are
stored), please adjust the SQL in :func:`authenticate` accordingly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import bcrypt
import psycopg2
from psycopg2 import sql


@dataclass
class AuthResult:
    """Result of an authentication attempt."""

    success: bool
    username: Optional[str] = None
    error_message: Optional[str] = None


def get_user_id_for_email(email: str) -> Optional[str]:
    """Return the local_users.id for *email*, or ``None`` if not found.

    This is a convenience helper used by the desktop UI to map a
    successfully authenticated username (email address) to the
    corresponding UUID used by the Crowdly backend.
    """

    email = email.strip()
    if not email:
        return None

    try:
        conn = _get_connection()
    except Exception:  # pragma: no cover - DB environment dependent
        return None

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """
                        SELECT id
                          FROM local_users
                         WHERE email = %s
                         LIMIT 1
                        """
                    ),
                    (email,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return str(row[0])
    except Exception:  # pragma: no cover - DB environment dependent
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _get_connection() -> psycopg2.extensions.connection:
    """Return a new connection to the local ``crowdly`` database.

    This uses libpq defaults, so it will connect to the local PostgreSQL
    server (typically on ``localhost``) and use the current OS user
    unless you override via environment variables (e.g. ``PGUSER``,
    ``PGPASSWORD``, ``PGHOST``).
    """

    return psycopg2.connect(dbname="crowdly")


def authenticate(username: str, password: str) -> AuthResult:
    """Check *username* and *password* against the ``local_users`` table.

    In this application the *username* field is treated as the user's
    email address and is matched against the ``email`` column. The
    password is currently compared directly against ``password_hash``;
    if you are storing a real hash, wire up the appropriate hash
    verification instead of a direct equality check.

    Parameters
    ----------
    username:
        The user name entered in the login dialog.
    password:
        The password entered in the login dialog.

    Returns
    -------
    AuthResult
        ``success`` is ``True`` when the combination is found in the
        ``local_users`` table. On error or mismatch, ``success`` is
        ``False`` and ``error_message`` may contain a human-readable
        explanation suitable for display in a message box.
    """

    username = username.strip()
    if not username or not password:
        return AuthResult(success=False, error_message="Username and password are required.")

    try:
        conn = _get_connection()
    except Exception as exc:  # pragma: no cover - DB environment dependent
        return AuthResult(
            success=False,
            error_message=f"Could not connect to local database: {exc}",
        )

    try:
        with conn:
            with conn.cursor() as cur:
                # Look up the stored password hash for this email.
                cur.execute(
                    sql.SQL(
                        """
                        SELECT password_hash
                          FROM local_users
                         WHERE email = %s
                         LIMIT 1
                        """
                    ),
                    (username,),
                )
                row = cur.fetchone()
                if not row:
                    return AuthResult(success=False, error_message="Invalid username or password.")

                stored_hash = row[0]
                try:
                    if bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")):
                        return AuthResult(success=True, username=username)
                    return AuthResult(success=False, error_message="Invalid username or password.")
                except ValueError as exc:
                    # Hash has unexpected format.
                    return AuthResult(
                        success=False,
                        error_message=f"Password hash format error: {exc}",
                    )
    except Exception as exc:  # pragma: no cover - DB environment dependent
        return AuthResult(
            success=False,
            error_message=f"Database error while checking credentials: {exc}",
        )
    finally:
        try:
            conn.close()
        except Exception:
            pass
