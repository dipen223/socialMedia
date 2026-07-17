import { useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SectionPanel from "@/components/dashboard/SectionPanel";

export default function ProfilePage() {
  const profile = useSelector((state) => state.auth.user);

  return (
    <DashboardLayout>
      <SectionPanel
        eyebrow="My Profile"
        title={profile?.userId?.name || "Your profile"}
        description={`@${profile?.userId?.username || "member"}`}
      >
        <p>{profile?.bio || "No bio yet."}</p>
      </SectionPanel>
    </DashboardLayout>
  );
}
