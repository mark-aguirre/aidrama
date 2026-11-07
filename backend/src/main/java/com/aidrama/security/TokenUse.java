package com.aidrama.security;

/** Purpose of a signed token. A token is only valid for the purpose it was issued for. */
public enum TokenUse {
    ACCESS("access"),
    REFRESH("refresh"),
    EMAIL_VERIFY("email_verify");

    private final String claimValue;

    TokenUse(String claimValue) {
        this.claimValue = claimValue;
    }

    public String claimValue() {
        return claimValue;
    }
}
