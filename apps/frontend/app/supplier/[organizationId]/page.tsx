import { SupplierWorkspace } from "../../../components/supplier-workspace";
export default async function SupplierPage({ params }: { params: Promise<{ organizationId: string }> }) { const { organizationId } = await params; return <SupplierWorkspace organizationId={organizationId} section="overview" />; }
