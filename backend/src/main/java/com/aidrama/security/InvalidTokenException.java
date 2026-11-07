package com.aidrama.security;

/** A token failed signature, expiry, issuer, audience or purpose validation. */
public class InvalidTokenException extends RuntimeException {

    public InvalidTokenException(String message, Throwable cause) {
        super(message, cause);
    }

    public InvalidTokenException(String message) {
        super(message);
    }
}
