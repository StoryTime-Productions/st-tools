import { BucketListView } from "@/app/bucket-list/_components/bucket-list-view";
import { getBucketList, getTagNames } from "@/lib/bucket-list";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function BucketListPage() {
  const user = await getCurrentUser();
  // layout.tsx redirects signed-out visitors; this only narrows the type
  if (!user) return null;

  const [grouped, tagNames] = await Promise.all([getBucketList(), getTagNames()]);

  return (
    <BucketListView
      grouped={grouped}
      tagNames={tagNames}
      viewer={{ id: user.id, role: user.role }}
    />
  );
}
