-- ============================================================
-- Lịch sử Aging Vùng XBG — chạy 1 lần trong Neon SQL Editor
-- Mô hình HYBRID:
--   aging_snapshots  = RAW từng đơn, chỉ giữ 180 ngày gần nhất (drill-down)
--   aging_daily_agg  = TỔNG HỢP theo ngày × AM × BC × nhóm ngày, giữ VĨNH VIỄN
-- ============================================================

-- RAW gần đây (tự xoá đơn > 180 ngày)
create table if not exists aging_snapshots (
  snapshot_date   date not null,          -- ngày chụp
  vung            text,
  tinh            text,
  bc              text,
  am              text,
  order_code      text,
  nhom_kh         text,                    -- Nhóm khách (SME/Shopee/TTS...)
  thoi_gian_nhap  timestamptz,             -- thời gian nhập BC giao
  so_ngay         numeric,                 -- số ngày tồn
  nhom_ngay       text,                    -- "Nhóm > 15 ngày"...
  updated_time    timestamptz
);
create index if not exists idx_snap_date       on aging_snapshots (snapshot_date);
create index if not exists idx_snap_date_am     on aging_snapshots (snapshot_date, am);
create index if not exists idx_snap_date_bc     on aging_snapshots (snapshot_date, bc);
create index if not exists idx_snap_order       on aging_snapshots (order_code);

-- TỔNG HỢP theo ngày — giữ vĩnh viễn (rất nhẹ, ~450 dòng/ngày)
create table if not exists aging_daily_agg (
  snapshot_date date not null,
  am            text not null default '',
  bc            text not null default '',
  nhom_ngay     text not null default '',
  so_don        integer not null,
  primary key (snapshot_date, am, bc, nhom_ngay)
);
create index if not exists idx_agg_date on aging_daily_agg (snapshot_date);
create index if not exists idx_agg_am   on aging_daily_agg (am);
