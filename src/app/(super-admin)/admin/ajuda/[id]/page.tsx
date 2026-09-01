import { notFound } from "next/navigation";
import { AdminReportDetail } from "@/components/admin/ajuda/admin-report-detail";
import { getSupportReportById } from "../actions";

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getSupportReportById(id);

  if (!report) notFound();

  return <AdminReportDetail report={report} />;
}
