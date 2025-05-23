// components/empty-state/index.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    type: {
      type: String,
      value: 'default' // default, cart, order, favorite, coupon
    },
    text: {
      type: String,
      value: '暂无数据'
    },
    buttonText: {
      type: String,
      value: ''
    },
    showButton: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    imageMap: {
      default: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/empty/empty_cart.png', // 使用购物车空状态作为默认
      cart: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/empty/empty_cart.png',
      order: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/empty/empty_order.png',
      favorite: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/empty/empty_favorite.png',
      coupon: 'cloud://cloud1-2gz5tcgibdf4bfc0.636c-cloud1-2gz5tcgibdf4bfc0-1360056125/images/empty/empty_cart.png' // 暂用购物车空状态替代
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击按钮
    onButtonTap: function() {
      this.triggerEvent('buttonclick')
    }
  }
})
