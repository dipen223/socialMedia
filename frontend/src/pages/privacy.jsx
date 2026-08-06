import LegalPage from "@/components/common/LegalPage";
import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How SocialHub collects, uses, and protects personal information."
    >
      <p className="lead">
        This policy explains how SocialHub handles information when you create an
        account or use its social and communication features.
      </p>

      <section>
        <h2>Information we collect</h2>
        <p>
          We collect account information such as your name, username, email
          address, password hash, profile and cover images, and profile details
          you choose to provide.
        </p>
        <p>
          We also store content and activity needed to operate SocialHub, including
          posts, comments, messages, connections, saved content, stories,
          notifications, and discussion activity.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use this information to create and secure accounts, provide social
          and communication features, personalize profiles and feeds, prevent
          abuse, maintain the service, and respond to support or privacy
          requests.
        </p>
      </section>

      <section>
        <h2>How information is shared</h2>
        <p>
          Profile information and content are shared with other SocialHub users
          according to the feature being used. We also use service providers
          that host the application, database, uploaded media, communications,
          and other infrastructure. We do not sell personal information.
        </p>
        <p>
          We may disclose information when required by law or when reasonably
          necessary to protect SocialHub, its users, or the public.
        </p>
      </section>

      <section>
        <h2>Storage and security</h2>
        <p>
          We use reasonable technical and organizational measures to protect
          information. No internet service can guarantee absolute security.
          Authentication sessions expire, and passwords are stored as hashes
          rather than readable text.
        </p>
      </section>

      <section>
        <h2>Retention and your choices</h2>
        <p>
          We retain information while an account is active and as needed to
          operate the service, resolve disputes, enforce agreements, and comply
          with legal obligations. You may update available profile information
          in SocialHub and request deletion using our{" "}
          <Link href="/data-deletion">data deletion instructions</Link>.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          SocialHub is not directed to children under 13, and we do not knowingly
          collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as SocialHub changes. The effective date above
          will be updated when revisions are published.
        </p>
      </section>
    </LegalPage>
  );
}
