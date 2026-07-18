import { useState } from 'react';
import { Text, View } from 'react-native';

import * as adminApi from '../../../services/api/admin';
import type { Announcement } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { IconButton } from '../../../components/ui/IconButton';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { TextField } from '../../../components/ui/TextField';
import { toast } from '../../../store/toastStore';
import { apiErrorMessage } from '../../../utils/apiError';
import { adminStyles } from '../adminStyles';
import { timeAgo } from '../adminHelpers';

export function AnnouncementsTab({
  items,
  onCreated,
  onDeleted,
}: {
  items: Announcement[];
  onCreated: (item: Announcement) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  async function post() {
    if (!title.trim() || !body.trim() || posting) return;
    setPosting(true);
    try {
      const created = await adminApi.createAnnouncement(title.trim(), body.trim());
      onCreated(created);
      setTitle('');
      setBody('');
      toast('Announcement posted', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't post that announcement."), 'error');
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.deleteAnnouncement(id);
      onDeleted(id);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't remove that announcement."), 'error');
    }
  }

  return (
    <View>
      <GlassPanel style={adminStyles.panel}>
        <View style={adminStyles.panelBody}>
          <SectionHeader title="New announcement" titleStyle={adminStyles.inlineSectionTitle} />
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
          />
          <TextField
            label="Message"
            value={body}
            onChangeText={setBody}
            placeholder="What do you want users to see?"
            multiline
            style={adminStyles.announcementBody}
          />
          <Button
            label={!title.trim() || !body.trim() ? 'Add a title and message' : 'Post announcement'}
            onPress={post}
            disabled={posting || !title.trim() || !body.trim()}
            loading={posting}
            style={adminStyles.postButton}
          />
        </View>
      </GlassPanel>

      <SectionHeader title="Posted" style={adminStyles.sectionHeader} titleStyle={adminStyles.sectionTitle} />
      {items.length === 0 ? (
        <Text style={adminStyles.mutedLine}>No announcements yet.</Text>
      ) : (
        <View style={adminStyles.list}>
          {items.map((item) => (
            <GlassPanel key={item.id} style={[adminStyles.row, adminStyles.rowHealthy]}>
              <View pointerEvents="none" style={[adminStyles.rowAccent, adminStyles.rowAccentHealthy]} />
              <View style={[adminStyles.rowContent, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={adminStyles.title}>{item.title}</Text>
                  <Text style={adminStyles.mutedLine}>{item.body}</Text>
                  <Text style={adminStyles.mutedLine}>{timeAgo(item.created_at)}</Text>
                </View>
                <IconButton
                  icon="trash-outline"
                  accessibilityLabel={`Remove announcement ${item.title}`}
                  onPress={() => remove(item.id)}
                  variant="danger"
                />
              </View>
            </GlassPanel>
          ))}
        </View>
      )}
    </View>
  );
}
