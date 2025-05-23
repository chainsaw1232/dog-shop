# 狗狗零食商城微信小程序项目说明（已修复tabBar图标）

## 项目概述

本项目是一个完整的狗狗零食商城微信小程序，包含前端页面、组件和后端API示例代码。所有图片资源均已生成并集成到代码中，可直接运行使用。

## 修复说明

已修复的问题：
- 补充了所有tabBar所需图标：
  - home.png 和 home_selected.png
  - category.png 和 category_selected.png
  - cart.png 和 cart_selected.png
  - user.png 和 user_selected.png
- 确保所有图片路径与app.json引用完全一致
- 验证所有图片资源可正确加载

## 图片资源说明

项目包含以下图片资源，全部位于`/static/images/`目录下：

### 1. TabBar图标
- `/static/images/tabbar/home.png` - 首页图标（未选中）
- `/static/images/tabbar/home_selected.png` - 首页图标（选中）
- `/static/images/tabbar/category.png` - 分类图标（未选中）
- `/static/images/tabbar/category_selected.png` - 分类图标（选中）
- `/static/images/tabbar/cart.png` - 购物车图标（未选中）
- `/static/images/tabbar/cart_selected.png` - 购物车图标（选中）
- `/static/images/tabbar/user.png` - 用户图标（未选中）
- `/static/images/tabbar/user_selected.png` - 用户图标（选中）

### 2. 品牌和Logo
- `/static/images/logo/logo.png` - 商城Logo

### 3. 轮播图
- `/static/images/banner/banner_01.png` - 首页轮播图1
- `/static/images/banner/banner_02.png` - 首页轮播图2
- `/static/images/banner/banner_03.png` - 首页轮播图3

### 4. 分类图标
- `/static/images/category/category_01.png` - 肉类零食分类图标
- `/static/images/category/category_02.png` - 骨头饼干分类图标
- `/static/images/category/category_03.png` - 洁牙零食分类图标
- `/static/images/category/category_04.png` - 训练零食分类图标

### 5. 商品图片
- `/static/images/products/product_01.png` - 优质牛肉干
- `/static/images/products/product_02.png` - 天然骨形饼干
- `/static/images/products/product_03.png` - 洁齿磨牙棒
- `/static/images/products/product_04.png` - 鸡肉训练奖励零食
- `/static/images/products/product_05.png` - 天然红薯干
- `/static/images/products/product_06.png` - 三文鱼味小饼干

### 6. 功能图标
- `/static/images/icons/cart.png` - 购物车图标
- `/static/images/icons/favorite.png` - 收藏图标
- `/static/images/icons/user.png` - 用户图标
- `/static/images/icons/order.png` - 订单图标
- `/static/images/icons/address.png` - 地址图标
- `/static/images/icons/review.png` - 评价图标

### 7. 状态图片
- `/static/images/empty/empty_cart.png` - 空购物车状态图
- `/static/images/empty/empty_favorite.png` - 空收藏状态图
- `/static/images/empty/empty_order.png` - 空订单状态图
- `/static/images/loading/loading.png` - 加载状态图

### 8. 用户相关
- `/static/images/avatar/default_avatar.png` - 默认用户头像
- `/static/images/review/review_sample.png` - 评价示例图片

## 使用说明

1. 使用微信开发者工具导入项目
2. 所有图片资源已集成到代码中，无需额外配置
3. 项目使用本地模拟数据，可直接预览运行
4. 如需连接实际后端，请修改app.js中的baseUrl配置

## 开发建议

1. 图片资源已按功能模块分类存放，便于管理和扩展
2. 如需添加新图片，建议保持相同的命名规范和目录结构
3. 所有页面和组件已配置正确的图片路径，可作为开发参考
4. 后端API示例代码中也包含了图片资源的引用示例

## 注意事项

1. 项目中的商品数据、用户信息等均为模拟数据
2. 实际部署时，建议将图片资源上传至CDN以提高加载速度
3. 小程序上线前需替换为实际的商品图片和内容
