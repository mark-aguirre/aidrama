package com.aidrama.auth;

import com.aidrama.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * MVP stub: no email is sent. By default only a masked address is logged. The verification link
 * is a credential, so it is logged only when {@code aidrama.mail.log-links=true} (local dev).
 */
@Component
public class LoggingAccountMailer implements AccountMailer {

    private static final Logger log = LoggerFactory.getLogger(LoggingAccountMailer.class);

    private final boolean logLinks;

    public LoggingAccountMailer(AppProperties properties) {
        this.logLinks = properties.mail().logLinks();
    }

    @Override
    public void sendEmailVerification(String toEmail, String displayName, String verifyUrl) {
        if (logLinks) {
            log.info("[MAIL STUB] Verification link for {}: {}", mask(toEmail), verifyUrl);
        } else {
            log.info("[MAIL STUB] Verification email requested for {} (not sent: no mail provider configured)", mask(toEmail));
        }
    }

    static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "***" + (at < 0 ? "" : email.substring(at));
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
