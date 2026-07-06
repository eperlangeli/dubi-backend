'use strict';

const CONSENT_POLICY = Object.freeze({
  privacyPolicyVersion: process.env.PRIVACY_POLICY_VERSION || 'privacy-policy-2026-06',
  termsVersion: process.env.TERMS_VERSION || 'terms-2026-06',
  healthDisclaimerVersion: process.env.HEALTH_DISCLAIMER_VERSION || 'health-disclaimer-2026-06',
  wearablePolicyVersion: process.env.WEARABLE_POLICY_VERSION || 'wearable-consent-2026-06',
  researchPolicyVersion: process.env.RESEARCH_POLICY_VERSION || 'research-consent-2026-06'
});

module.exports = {
  CONSENT_POLICY
};
