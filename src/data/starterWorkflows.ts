import type { WorkflowStep } from "../domain/types";

export interface StarterWorkflow {
  id: string;
  name: string;
  description: string;
  steps: Array<Pick<WorkflowStep, "commandId" | "parameters">>;
}

export const starterWorkflows: StarterWorkflow[] = [
  {
    id: "product-photo-quality",
    name: "Product photo quality",
    description: "Phân tích ảnh sản phẩm, chỉnh sửa chi tiết và kiểm tra chất lượng trước khi xuất.",
    steps: [
      { commandId: "analyze", parameters: { raw: "scope=full-image subject=product" } },
      { commandId: "sharpen", parameters: { raw: "target=product-details strength=medium" } },
      { commandId: "white-balance", parameters: { raw: "white-balance=neutral preserve-brand-colors=true" } },
      { commandId: "qc", parameters: { raw: "level=professional" } },
      { commandId: "export", parameters: { raw: "format=png quality=100" } },
    ],
  },
  {
    id: "background-replacement",
    name: "Background replacement",
    description: "Tách chủ thể, thay nền và kiểm tra đường viền hòa trộn.",
    steps: [
      { commandId: "analyze", parameters: { raw: "scope=subject-and-background" } },
      { commandId: "remove-bg", parameters: { raw: "preserve-subject=true edge-quality=high" } },
      { commandId: "background", parameters: { raw: "style=studio target=clean-commercial" } },
      { commandId: "shadow", parameters: { raw: "style=soft-contact direction=consistent" } },
      { commandId: "edge-check", parameters: { raw: "subject=foreground" } },
    ],
  },
  {
    id: "ecommerce-product",
    name: "E-commerce product",
    description: "Chuẩn hóa ảnh sản phẩm cho gian hàng trực tuyến.",
    steps: [
      { commandId: "analyze", parameters: { raw: "scope=product-image" } },
      { commandId: "lock-product", parameters: { raw: "subject=main-product" } },
      { commandId: "background", parameters: { raw: "style=white-clean" } },
      { commandId: "aspect-ratio", parameters: { raw: "value=1:1 fit=contain" } },
      { commandId: "resolution", parameters: { raw: "width=1600 height=1600" } },
      { commandId: "compress", parameters: { raw: "target=under-500kb format=webp" } },
    ],
  },
  {
    id: "portrait-retouch",
    name: "Portrait retouch",
    description: "Tinh chỉnh chân dung tự nhiên, bảo toàn nhận diện và rà soát lỗi.",
    steps: [
      { commandId: "analyze", parameters: { raw: "scope=portrait lighting=skin" } },
      { commandId: "lock-face", parameters: { raw: "subject=primary-person" } },
      { commandId: "retouch", parameters: { raw: "strength=low preserve-natural-texture=true" } },
      { commandId: "light-check", parameters: { raw: "compare=face-and-background" } },
      { commandId: "final-review", parameters: { raw: "checklist=portrait-naturalness" } },
    ],
  },
  {
    id: "social-campaign-export",
    name: "Social campaign export",
    description: "Chuẩn bị phiên bản ảnh theo tỷ lệ mạng xã hội và tối ưu tệp đầu ra.",
    steps: [
      { commandId: "analyze", parameters: { raw: "scope=campaign-master" } },
      { commandId: "lock-product", parameters: { raw: "subject=main-product" } },
      { commandId: "social-media", parameters: { raw: "platform=facebook format=feed" } },
      { commandId: "aspect-ratio", parameters: { raw: "value=4:5 fit=outpaint" } },
      { commandId: "text-check", parameters: { raw: "language=vi" } },
      { commandId: "export", parameters: { raw: "format=jpg quality=92" } },
    ],
  },
];
