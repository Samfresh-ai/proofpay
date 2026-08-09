import type { Metadata } from "next";

import { CreateMilestoneWorkspace } from "@/components/create-milestone";

export const metadata: Metadata = {
  title: "Milestone workspace",
};

export default function AppPage() {
  return <CreateMilestoneWorkspace />;
}
