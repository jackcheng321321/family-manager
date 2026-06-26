import type { HealthCheckupStatus, HealthItemFlag, MedicalAttachmentType } from "@caiwu/shared";

export const CHECKUP_STATUS: Record<HealthCheckupStatus, { label: string; cls: string }> = {
  pending: { label: "待处理", cls: "bg-gray-100 text-gray-700" },
  parsing: { label: "解析中", cls: "bg-blue-100 text-blue-700" },
  done: { label: "已解析", cls: "bg-green-100 text-green-700" },
  needs_manual: { label: "需手动补充", cls: "bg-amber-100 text-amber-700" },
  failed: { label: "解析失败", cls: "bg-red-100 text-red-700" },
};

export const ITEM_FLAG: Record<HealthItemFlag, { label: string; cls: string }> = {
  normal: { label: "正常", cls: "bg-green-100 text-green-700" },
  high: { label: "偏高", cls: "bg-red-100 text-red-700" },
  low: { label: "偏低", cls: "bg-orange-100 text-orange-700" },
  abnormal: { label: "异常", cls: "bg-red-100 text-red-700" },
  unknown: { label: "—", cls: "bg-gray-100 text-gray-500" },
};

export const ATTACHMENT_TYPE: Record<MedicalAttachmentType, string> = {
  exam_result: "检查结果",
  lab_report: "化验单",
  prescription: "处方",
  receipt: "票据",
  other: "其他",
};

export const ATTACHMENT_TYPE_OPTIONS: { value: MedicalAttachmentType; label: string }[] = [
  { value: "exam_result", label: "检查结果" },
  { value: "lab_report", label: "化验单" },
  { value: "prescription", label: "处方" },
  { value: "receipt", label: "票据" },
  { value: "other", label: "其他" },
];
