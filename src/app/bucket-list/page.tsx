import { BucketListView } from "@/app/bucket-list/_components/bucket-list-view";
import { getBucketList } from "@/lib/bucket-list";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function BucketListPage() {
  const user = await getCurrentUser();
  // layout.tsx redirects signed-out visitors; this only narrows the type
  if (!user) return null;

  const grouped = await getBucketList();

  return <BucketListView grouped={grouped} viewer={{ id: user.id, role: user.role }} />;
}
