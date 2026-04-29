// src/app/teacher/results/page.tsx
"use client";

import { withRole } from "@/components/withRole";
import TeacherResultsDashboard from "@/components/teacher/TeacherResultsDashboard";

function TeacherResultsPage() {
  return <TeacherResultsDashboard />;
}

export default withRole(TeacherResultsPage, ["teacher", "admin"]);
