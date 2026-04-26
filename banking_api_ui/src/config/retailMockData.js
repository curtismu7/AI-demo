// banking_api_ui/src/config/retailMockData.js
// Client-side mock data for ff_retail_mode (D-01: zero BFF changes).

export const RETAIL_PRODUCTS = [
  { id: "p1",  sku: "BB-65QLED",  name: 'Samsung 65" QLED TV',       price: 1299, stock: "In Stock",      category: "TV" },
  { id: "p2",  sku: "BB-MBP14",   name: 'MacBook Pro 14"',            price: 1999, stock: "In Stock",      category: "Laptop" },
  { id: "p3",  sku: "BB-APP3",    name: "AirPods Pro",                price:  249, stock: "In Stock",      category: "Audio" },
  { id: "p4",  sku: "BB-WH1000",  name: "Sony WH-1000XM5",            price:  349, stock: "In Stock",      category: "Audio" },
  { id: "p5",  sku: "BB-PS5",     name: "PlayStation 5",              price:  499, stock: "Low Stock",     category: "Gaming" },
  { id: "p6",  sku: "BB-ROGLTOP", name: "ASUS ROG Gaming Laptop",     price: 1199, stock: "In Stock",      category: "Laptop" },
  { id: "p7",  sku: "BB-BOSE-SL", name: "Bose SoundLink Speaker",     price:  149, stock: "In Stock",      category: "Audio" },
  { id: "p8",  sku: "BB-LG27",    name: 'LG 27" 4K Monitor',          price:  399, stock: "In Stock",      category: "Monitor" },
  { id: "p9",  sku: "BB-IP16PRO", name: "iPhone 16 Pro",              price:  999, stock: "Limited Stock", category: "Phone" },
  { id: "p10", sku: "BB-GRM-F8",  name: "Garmin Fenix 8",             price:  799, stock: "In Stock",      category: "Wearable" },
];

export const RETAIL_ORDERS = [
  { id: "o1", product: "AirPods Pro",      sku: "BB-APP3",    amount:  249, status: "Delivered",  date: "2026-04-20" },
  { id: "o2", product: 'MacBook Pro 14"',  sku: "BB-MBP14",   amount: 1999, status: "Shipped",    date: "2026-04-22" },
  { id: "o3", product: "Bose SoundLink",   sku: "BB-BOSE-SL", amount:  149, status: "Processing", date: "2026-04-23" },
];
