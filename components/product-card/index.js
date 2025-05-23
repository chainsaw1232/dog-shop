// components/product-card/index.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    product: {
      type: Object,
      value: {}
    },
    mode: {
      type: String,
      value: 'default' // default, simple, horizontal
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击商品卡片
    onTap: function() {
      const product = this.properties.product
      this.triggerEvent('click', { id: product.id })
    },
    
    // 点击收藏按钮
    onFavoriteTap: function(e) {
      e.stopPropagation()
      const product = this.properties.product
      this.triggerEvent('favorite', { id: product.id, isFavorite: !product.isFavorite })
    },
    
    // 点击加入购物车按钮
    onCartTap: function(e) {
      e.stopPropagation()
      const product = this.properties.product
      this.triggerEvent('cart', { id: product.id })
    }
  }
})
