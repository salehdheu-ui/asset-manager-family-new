-- نقل محتوى المرفقات الجديدة إلى Object Storage مع إبقاء legacy content للترحيل التدريجي.
-- يمكن تشغيل هذا الملف أكثر من مرة بأمان.
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS storage_url TEXT;

ALTER TABLE attachments
  ALTER COLUMN content DROP NOT NULL;

CREATE INDEX IF NOT EXISTS attachments_storage_key_idx
  ON attachments (storage_key);
