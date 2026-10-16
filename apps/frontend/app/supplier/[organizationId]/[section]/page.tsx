import { SupplierWorkspace } from "../../../../components/supplier-workspace";
export default async function SupplierSectionPage({ params }: { params: Promise<{ section: string; organizationId: string }> }) { const { section, organizationId } = await params; return <SupplierWorkspace organizationId={organizationId} section={section} />; }
