package com.aidrama.auth;

/** Outgoing account email. The MVP implementation only logs; swap in a real sender later. */
public interface AccountMailer {

    /** Sends the address-verification link. {@code verifyUrl} contains a credential and must not be logged by real senders. */
    void sendEmailVerification(String toEmail, String displayName, String verifyUrl);
}
