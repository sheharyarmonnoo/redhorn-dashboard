"use client";
import PageHeader from "@/components/PageHeader";
import ActionItems from "@/components/ActionItems";

export default function TasksPage() {
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Drag to move between columns. Assign to a Redhorn team member." />
      <ActionItems showHeader={false} />
    </div>
  );
}
