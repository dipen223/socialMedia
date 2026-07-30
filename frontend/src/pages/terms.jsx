import LegalPage from "@/components/common/LegalPage";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms that apply when using Ripple."
    >
      <p className="lead">
        By creating an account or using Ripple, you agree to these terms.
      </p>

      <section>
        <h2>Using Ripple</h2>
        <p>
          You must provide accurate account information, keep your credentials
          secure, and use the service lawfully. You are responsible for activity
          performed through your account.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You retain ownership of content you submit. You grant Ripple a
          non-exclusive license to host, process, display, and distribute that
          content only as needed to operate and improve the service.
        </p>
      </section>

      <section>
        <h2>Acceptable conduct</h2>
        <p>
          Do not harass others, impersonate people, violate intellectual
          property rights, distribute malware, attempt unauthorized access, or
          use Ripple for illegal activity. We may remove content or restrict
          accounts that create risk or violate these terms.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          Ripple may rely on third-party identity, hosting, media, and
          infrastructure services. Their own terms and policies may also apply
          when you interact with them.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          Ripple is provided on an as-available basis. Features may change, be
          interrupted, or be discontinued. To the extent permitted by law, the
          service is provided without warranties of uninterrupted operation.
        </p>
      </section>

      <section>
        <h2>Ending use</h2>
        <p>
          You may stop using Ripple or request account deletion. We may suspend
          access when reasonably necessary to protect users, comply with law, or
          enforce these terms.
        </p>
      </section>
    </LegalPage>
  );
}
