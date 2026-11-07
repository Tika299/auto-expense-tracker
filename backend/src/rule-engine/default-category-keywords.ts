export type DefaultCategoryKeywordRule = {
  direction: 'IN' | 'OUT';
  categoryName: string;
  keywords: string[];
};

/**
 * Thứ tự rất quan trọng.
 *
 * Ví dụ GRABFOOD phải được kiểm tra trước GRAB,
 * nếu không giao dịch đồ ăn có thể bị phân loại thành Di chuyển.
 */
export const DEFAULT_CATEGORY_KEYWORDS: DefaultCategoryKeywordRule[] = [
  {
    direction: 'OUT',
    categoryName: 'Ăn uống',
    keywords: [
      'GRABFOOD',
      'SHOPEEFOOD',
      'FOODY',
      'RESTAURANT',
      'CAFE',
      'COFFEE',
      'HIGHLANDS',
      'PHUC LONG',
      'KFC',
      'LOTTERIA',
      'BÁNH',
      'CƠM',
      'PHỞ',
      'HỦ TIẾU',
    ],
  },
  {
    direction: 'OUT',
    categoryName: 'Di chuyển',
    keywords: [
      'GRAB',
      'BE',
      'XANH SM',
      'TAXI',
      'PETROLIMEX',
      'XĂNG',
      'VÉ XE',
      'VÉ TÀU',
      'VIETJET',
      'VIETNAM AIRLINES',
    ],
  },
  {
    direction: 'OUT',
    categoryName: 'Mua sắm',
    keywords: [
      'SHOPEE',
      'LAZADA',
      'TIKI',
      'TIKTOK SHOP',
      'WINMART',
      'COOPMART',
      'BÁCH HÓA XANH',
    ],
  },
  {
    direction: 'OUT',
    categoryName: 'Hóa đơn',
    keywords: [
      'EVN',
      'TIỀN ĐIỆN',
      'TIỀN NƯỚC',
      'INTERNET',
      'VIETTEL',
      'VINAPHONE',
      'MOBIFONE',
      'NẠP DATA',
      'THANH TOÁN HÓA ĐƠN',
    ],
  },
  {
    direction: 'IN',
    categoryName: 'Lương',
    keywords: ['LƯƠNG', 'LUONG', 'SALARY', 'PAYROLL'],
  },
  {
    direction: 'IN',
    categoryName: 'Hoàn tiền',
    keywords: ['HOÀN TIỀN', 'HOAN TIEN', 'REFUND', 'CASHBACK'],
  },
  {
    direction: 'IN',
    categoryName: 'Thu nhập khác',
    keywords: ['COD', 'GIAOHANGTIETKIEM', 'GIAO HANG TIET KIEM', 'THU NHẬP'],
  },
];
