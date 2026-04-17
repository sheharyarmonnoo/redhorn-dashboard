import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </>
  );
}
