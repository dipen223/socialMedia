import LegalPage from "@/components/common/LegalPage";

export default function DataDeletion() {
  const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

  return (
    <LegalPage
      title="Data Deletion"
      description="How to request deletion of a Ripple account and associated data."
    >
      <p className="lead">
        You can request deletion of your Ripple account and associated personal
        information.
      </p>

      <section>
        <h2>Submit a request</h2>
        {privacyEmail ? (
          <p>
            Email <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a> from the
            address connected to your Ripple account. Use the subject
            &quot;Ripple data deletion request&quot; and include your Ripple
            username.
          </p>
        ) : (
          <p>
            The app operator must configure and publish a monitored deletion
            request email before Ripple is launched publicly.
          </p>
        )}
      </section>

      <section>
        <h2>Verification</h2>
        <p>
          We may ask you to verify control of the account before deletion. Do
          not send your password, session token, or other authentication
          secrets.
        </p>
      </section>

      <section>
        <h2>What happens next</h2>
        <p>
          After verification, we will delete or anonymize the account and
          associated personal information unless retention is required for
          security, fraud prevention, legal compliance, or dispute resolution.
          We will confirm when the request has been completed.
        </p>
      </section>

    </LegalPage>
  );
}
