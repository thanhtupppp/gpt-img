import type { ParameterDefinition } from "../domain/types";

export interface CommandCatalogEntry {
  id: string;
  name: string;
  module: string;
  description: string;
  syntax: string;
  parameters: ParameterDefinition[];
  examples: string[];
  tags: string[];
}

type CommandSeed = [id: string, description: string, example: string, tags: string[]];

const modules: Array<{ name: string; commands: CommandSeed[] }> = [
  { name: "Source", commands: [
    ["source","Đưa ảnh hoặc tệp nguồn vào ngữ cảnh chỉnh sửa; giữ nguyên tệp gốc.","/source image=product-front.jpg",["input","asset"]],
    ["reference","Khai báo ảnh tham chiếu cho phong cách, bố cục hoặc đặc điểm cần đối chiếu.","/reference image=reference.jpg purpose=lighting",["reference","input"]],
    ["analyze","Phân tích chủ thể, bố cục, ánh sáng, màu sắc và các vùng cần xử lý trước khi chỉnh sửa.","/analyze scope=full",["analysis","inspection"]],
    ["detect","Phát hiện và phân loại chủ thể, vật thể hoặc vùng quan tâm trong ảnh.","/detect target=objects",["detection","objects"]],
    ["segment","Tách chủ thể hoặc vùng ảnh thành các phân vùng độc lập để xử lý chọn lọc.","/segment target=main-subject",["segmentation","mask"]],
    ["mask","Tạo hoặc áp dụng mặt nạ xác định chính xác vùng được phép chỉnh sửa.","/mask region=background mode=protect-subject",["mask","selection"]],
    ["crop","Cắt ảnh theo vùng, tỷ lệ hoặc khung bố cục được chỉ định.","/crop aspect=4:5 anchor=center",["framing","composition"]],
    ["straighten","Căn thẳng đường chân trời hoặc trục hình học bị nghiêng.","/straighten reference=horizontal-lines",["geometry","alignment"]],
    ["perspective","Hiệu chỉnh phối cảnh và hội tụ đường thẳng theo hình học mục tiêu.","/perspective mode=correct verticals",["geometry","correction"]],
    ["extract","Tách chủ thể hoặc chi tiết khỏi ảnh nguồn với biên và vùng tóc/lông được bảo toàn.","/extract target=main-subject edge=refined",["extraction","selection"]]
  ]},
  { name: "Edit", commands: [
    ["remove-bg","Loại bỏ nền, tạo vùng trong suốt và giữ biên chủ thể tự nhiên.","/remove-bg edge=refined preserve-shadows=false",["background","cutout"]],
    ["replace-bg","Thay nền bằng cảnh hoặc màu mới, đồng bộ phối cảnh và ánh sáng.","/replace-bg scene=clean-studio",["background","composite"]],
    ["retouch","Sửa khuyết điểm cục bộ, giữ kết cấu và đặc trưng tự nhiên của chủ thể.","/retouch strength=0.25 preserve-texture=true",["retouch","cleanup"]],
    ["restore","Phục hồi vùng ảnh xuống cấp, trầy xước, phai màu hoặc hư hại.","/restore damage= scratches-and-fading",["restoration","repair"]],
    ["upscale","Tăng độ phân giải với chi tiết được tái tạo có kiểm soát.","/upscale factor=2 preserve-edges=true",["resolution","enhancement"]],
    ["denoise","Giảm nhiễu hạt và nhiễu màu trong khi bảo toàn chi tiết hữu ích.","/denoise strength=medium",["noise","cleanup"]],
    ["sharpen","Tăng độ rõ cạnh và chi tiết mà không tạo viền giả quá mức.","/sharpen amount=0.3 radius=1",["detail","clarity"]],
    ["deblur","Giảm nhòe do chuyển động hoặc sai nét trong phạm vi có thể phục hồi.","/deblur mode=motion",["blur","restoration"]],
    ["inpaint","Tái tạo vùng được chọn dựa trên nội dung và ngữ cảnh xung quanh.","/inpaint region=selected",["generative-edit","repair"]],
    ["outpaint","Mở rộng khung ảnh và tạo phần nội dung mới liền mạch bên ngoài biên.","/outpaint direction=right expansion=25%",["generative-edit","canvas"]]
  ]},
  { name: "Visual", commands: [
    ["exposure","Điều chỉnh độ sáng tổng thể và cân bằng vùng sáng/tối.","/exposure value=+0.3ev",["light","tonal"]],
    ["white-balance","Cân bằng nhiệt độ màu và sắc thái ám màu theo nguồn sáng.","/white-balance temperature=5200K tint=0",["color","light"]],
    ["color-grade","Tạo hệ màu nhất quán theo phong cách hoặc bảng màu mục tiêu.","/color-grade look=natural-commercial",["color","style"]],
    ["color-match","Khớp màu giữa ảnh nguồn và ảnh tham chiếu hoặc các thành phần ghép.","/color-match reference=reference.jpg",["color","matching"]],
    ["saturation","Điều chỉnh cường độ màu có kiểm soát, tránh bão hòa quá mức.","/saturation value=+8",["color","tonal"]],
    ["contrast","Điều chỉnh tương phản và độ tách bạch giữa vùng sáng/tối.","/contrast value=+10",["tonal","clarity"]],
    ["studio-light","Thiết lập ánh sáng studio mềm, hướng sáng và độ chuyển vùng sáng.","/studio-light setup=softbox-left fill=low",["lighting","studio"]],
    ["relight","Tái cân bằng hướng, cường độ và màu ánh sáng trên chủ thể/cảnh.","/relight direction=upper-left intensity=medium",["lighting","scene"]],
    ["shadow","Tạo hoặc hiệu chỉnh bóng đổ theo mặt phẳng tiếp xúc và hướng sáng.","/shadow type=soft-contact opacity=35%",["lighting","depth"]],
    ["reflection","Tạo hoặc điều chỉnh phản chiếu phù hợp vật liệu và bề mặt.","/reflection surface=glossy intensity=low",["lighting","material"]]
  ]},
  { name: "Compose", commands: [
    ["composite","Kết hợp nhiều lớp hoặc nguồn ảnh thành một bố cục thống nhất.","/composite layers=subject,background",["layers","merge"]],
    ["blend","Hòa trộn hai lớp theo chế độ và cường độ được chọn.","/blend mode=soft-light opacity=40%",["layers","blend"]],
    ["layer","Tạo, sắp xếp hoặc cấu hình lớp nội dung trong bố cục.","/layer action=add name=foreground",["layers","structure"]],
    ["depth","Tạo cảm nhận chiều sâu bằng phân lớp, độ mờ và phối cảnh.","/depth focus=subject background-blur=low",["depth","focus"]],
    ["background","Thiết lập nền theo màu, chất liệu hoặc bối cảnh yêu cầu.","/background type=solid color=#F5F2EA",["background","scene"]],
    ["environment","Đặt chủ thể vào môi trường cụ thể và đồng bộ ánh sáng/bóng.","/environment scene=modern-kitchen",["scene","context"]],
    ["relocate","Di chuyển chủ thể đến vị trí mới trong cùng khung hình hoặc cảnh.","/relocate subject=main position=right-third",["position","composition"]],
    ["reposition","Tinh chỉnh vị trí, căn lề và khoảng cách của thành phần.","/reposition element=product x=50% y=55%",["position","layout"]],
    ["scale","Thay đổi kích thước thành phần theo tỷ lệ, giữ đúng tỷ lệ hình học.","/scale element=product value=85%",["transform","size"]],
    ["perspective-match","Khớp góc nhìn và tỷ lệ phối cảnh giữa chủ thể với cảnh nền.","/perspective-match target=background",["geometry","composite"]]
  ]},
  { name: "Design", commands: [
    ["poster","Tạo cấu trúc poster theo mục đích truyền thông và định dạng đầu ra.","/poster format=retail-promotion ratio=9:16",["design","marketing"]],
    ["layout","Sắp xếp vùng nội dung, lưới, thứ bậc và khoảng trắng.","/layout grid=12-column hierarchy=clear",["design","composition"]],
    ["typography","Thiết lập kiểu chữ, cỡ chữ, trọng lượng và khả năng đọc.","/typography style=modern-sans hierarchy=3-level",["type","design"]],
    ["headline","Tạo hoặc định dạng tiêu đề chính theo thông điệp chiến dịch.","/headline text=\"Fresh every day\" emphasis=high",["copy","type"]],
    ["price-tag","Thiết kế vùng giá, đơn vị tính và thông tin khuyến mãi dễ nhận biết.","/price-tag price=19900 currency=VND unit=/kg",["retail","pricing"]],
    ["branding","Áp dụng hệ nhận diện thương hiệu và quy tắc sử dụng tài sản thương hiệu.","/branding identity=provided-brand-kit",["brand","identity"]],
    ["logo","Đặt hoặc xử lý logo, bảo toàn hình dạng, màu sắc và khoảng an toàn.","/logo asset=brand-logo.svg preserve=true",["brand","logo"]],
    ["infographic","Trình bày dữ liệu hoặc quy trình bằng cấu trúc đồ họa dễ hiểu.","/infographic layout=process steps=4",["data","visualization"]],
    ["mockup","Đặt thiết kế lên vật thể hoặc bối cảnh mô phỏng để xem trước.","/mockup product=shopping-bag view=front",["presentation","preview"]],
    ["social-media","Chuẩn hóa bố cục và kích thước cho nền tảng mạng xã hội.","/social-media platform=facebook format=feed",["social","export"]]
  ]},
  { name: "Control", commands: [
    ["preserve","Chỉ định các đặc điểm phải giữ nguyên trong suốt quá trình chỉnh sửa.","/preserve identity,shape,texture",["constraint","protection"]],
    ["lock-product","Khóa hình dáng, nhãn, bao bì và chi tiết nhận diện sản phẩm.","/lock-product subject=main-product",["constraint","product"]],
    ["lock-face","Bảo toàn nhận diện khuôn mặt, tỷ lệ và đặc điểm cá nhân.","/lock-face subject=portrait",["constraint","portrait"]],
    ["lock-logo","Ngăn thay đổi hình dạng, tỷ lệ và màu sắc của logo.","/lock-logo asset=brand-logo",["constraint","brand"]],
    ["lock-text","Bảo toàn nguyên văn nội dung chữ được chỉ định.","/lock-text content=all-visible-copy",["constraint","text"]],
    ["no-distortion","Ngăn kéo giãn, bóp méo hoặc thay đổi tỷ lệ không mong muốn.","/no-distortion target=all-subjects",["constraint","geometry"]],
    ["no-redesign","Giới hạn thao tác ở chỉnh sửa được yêu cầu, không tự thiết kế lại.","/no-redesign scope=entire-image",["constraint","scope"]],
    ["precise-edit","Giới hạn chỉnh sửa vào mục tiêu, vùng và thông số được nêu rõ.","/precise-edit target=selected-mask",["constraint","precision"]],
    ["selective-edit","Chỉ áp dụng hiệu chỉnh lên các vùng được chọn.","/selective-edit regions=mask-01,mask-02",["constraint","mask"]],
    ["reference-match","Ưu tiên khớp các thuộc tính được chỉ định từ ảnh tham chiếu.","/reference-match attributes=color,lighting,composition",["constraint","reference"]]
  ]},
  { name: "Quality", commands: [
    ["qc","Chạy kiểm tra chất lượng tổng thể trước khi xuất bản hoặc bàn giao.","/qc level=professional",["quality","review"]],
    ["detail-check","Kiểm tra độ rõ và tính toàn vẹn của chi tiết nhỏ.","/detail-check regions=product-label,edges",["quality","detail"]],
    ["edge-check","Kiểm tra viền cắt, quầng sáng và lỗi hòa trộn biên.","/edge-check subject=foreground",["quality","edges"]],
    ["light-check","Kiểm tra tính nhất quán của hướng sáng, độ sáng và bóng đổ.","/light-check compare=all-elements",["quality","lighting"]],
    ["color-check","Kiểm tra sai lệch màu, cân bằng trắng và tính nhất quán màu.","/color-check target=brand-and-product",["quality","color"]],
    ["anatomy-check","Kiểm tra cấu trúc giải phẫu và các biến dạng hình thể bất thường.","/anatomy-check subjects=all-people",["quality","anatomy"]],
    ["text-check","Kiểm tra chính tả, nội dung, độ rõ và tính nguyên vẹn của chữ.","/text-check language=vi",["quality","typography"]],
    ["artifact-check","Phát hiện dấu vết tạo sinh, nhiễu, đường nối và chi tiết bất thường.","/artifact-check scope=full-image",["quality","artifacts"]],
    ["consistency-check","Đối chiếu tính nhất quán giữa các thành phần và ảnh trong cùng bộ.","/consistency-check group=campaign-01",["quality","consistency"]],
    ["final-review","Tổng duyệt theo yêu cầu, ràng buộc và tiêu chí bàn giao.","/final-review checklist=project-brief",["quality","approval"]]
  ]},
  { name: "Output", commands: [
    ["export","Xuất ảnh hoặc tài sản theo định dạng và cấu hình được chỉ định.","/export format=png quality=100",["output","file"]],
    ["format","Chuyển đổi định dạng tệp mà không thay đổi nội dung ngoài yêu cầu.","/format target=webp",["output","conversion"]],
    ["resolution","Thiết lập độ phân giải đầu ra theo kích thước pixel mục tiêu.","/resolution width=2160 height=3840",["output","size"]],
    ["aspect-ratio","Đặt tỷ lệ khung hình và xử lý phần dư theo quy tắc bố cục.","/aspect-ratio value=9:16 fit=outpaint",["output","framing"]],
    ["resize","Thay đổi chiều rộng/chiều cao theo kích thước hoặc tỷ lệ mục tiêu.","/resize width=1080 height=1920",["output","size"]],
    ["compress","Giảm dung lượng tệp với mức chất lượng và định dạng phù hợp.","/compress target=under-500kb format=webp",["output","optimization"]],
    ["sharpen-output","Áp dụng làm nét cuối cùng phù hợp kích thước và phương tiện hiển thị.","/sharpen-output amount=low",["output","detail"]],
    ["color-profile","Gán hoặc chuyển hồ sơ màu để bảo đảm hiển thị nhất quán.","/color-profile target=sRGB",["output","color"]],
    ["version","Tạo phiên bản đầu ra có định danh để theo dõi và so sánh.","/version label=campaign-final-02",["output","versioning"]],
    ["deliver","Đóng gói và bàn giao tài sản cùng thông tin định dạng/phiên bản.","/deliver package=final-assets",["output","handoff"]]
  ]}
];

const titleCase = (id: string) => id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export const commandCatalog: CommandCatalogEntry[] = modules.flatMap((module) =>
  module.commands.map(([id, description, example, tags]) => ({
    id,
    name: titleCase(id),
    module: module.name,
    description,
    syntax: `/${id} [options]`,
    parameters: [],
    examples: [example],
    tags,
  }))
);

export function getCommandById(id: string): CommandCatalogEntry | undefined {
  return commandCatalog.find((command) => command.id === id);
}

export function searchCommands(query: string): CommandCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return commandCatalog;
  return commandCatalog.filter((command) =>
    [command.id, command.name, command.module, command.description, ...command.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized)
  );
}
