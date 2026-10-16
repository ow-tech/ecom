import { PlatformWorkspace } from "../../../components/platform-workspace";
export default async function PlatformSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <PlatformWorkspace section={section} />; }
