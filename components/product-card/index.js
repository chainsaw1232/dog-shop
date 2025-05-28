// components/product-card/index.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    product: {
      type: Object,
      value: {} // 默认值，期望传入的 product 对象包含 _id, name, mainImage, price, originalPrice, sales等
    },
    mode: {
      type: String,
      value: 'default' // 可选值: default, simple, horizontal，用于控制卡片的不同显示样式
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 这里可以放一些只在组件内部使用的数据
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击商品卡片
    onTap: function() {
      const product = this.properties.product;
      if (product && product._id) { // 确保 product 对象存在且有 _id
        // 关键修改：将 product.id 修改为 product._id
        this.triggerEvent('click', { id: product._id }); 
      } else {
        console.warn('Product data or product._id is missing in product-card component:', product);
        // 可以选择触发一个错误事件或不执行任何操作
        // this.triggerEvent('click', { id: null, error: 'Product ID is missing' });
      }
    },
    
    // 点击收藏按钮 (此事件由父组件处理收藏逻辑)
    onFavoriteTap: function(e) {
      // 阻止事件冒泡，防止触发 onTap
      // 小程序自定义组件的事件默认不会冒泡，除非显式开启 bubbles: true。
      // 但如果WXML结构复杂，显式阻止有时更保险。
      // e.stopPropagation(); // 通常不需要，但保留注释以备不时之需

      const product = this.properties.product;
      if (product && product._id) {
        // 假设 product 对象中有一个 isFavorite 状态，或者父组件会根据 product._id 判断
        this.triggerEvent('favorite', { 
          id: product._id, 
          isFavorite: !product.isFavorite // 传递一个建议的切换状态
        });
      } else {
        console.warn('Product data or product._id is missing for favorite action:', product);
      }
    },
    
    // 点击加入购物车按钮 (此事件由父组件处理加购逻辑)
    onCartTap: function(e) {
      // e.stopPropagation(); // 通常不需要

      const product = this.properties.product;
      if (product && product._id) {
        this.triggerEvent('cart', { id: product._id });
      } else {
        console.warn('Product data or product._id is missing for cart action:', product);
      }
    }
  }
})