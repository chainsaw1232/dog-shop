// pages/address/index.js
const app = getApp()

Page({
  data: {
    addresses: [],
    selectMode: false, // 是否为选择地址模式
    showForm: false, // 是否显示地址表单
    editMode: false, // 是否为编辑模式
    formData: {
      id: '',
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      isDefault: false,
      region: '' // 省市区显示文本
    },
    showRegionPicker: false, // 是否显示地区选择器
    provinces: [], // 省份列表
    cities: [], // 城市列表
    districts: [], // 区县列表
    regionValue: [0, 0, 0], // 地区选择器选中的索引
    tempRegion: {} // 临时存储选择的地区
  },

  onLoad: function(options) {
    if (options.select === 'true') {
      this.setData({ selectMode: true })
    }
    this.loadRegionData()
  },

  onShow: function() {
    this.fetchAddresses()
  },

  fetchAddresses: function() {
    if (!app.globalData.openid) { // 前端仍然需要检查 app.globalData.openid 来判断用户是否已登录并获取了 openid
      console.warn('fetchAddresses: app.globalData.openid is null, cannot fetch addresses.');
       // 可以在这里提示用户登录
      wx.showModal({
        title: '登录提示',
        content: '请先登录以查看地址信息。',
        confirmText: '去登录',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/user/index' });
          }
        }
      });
      return;
    }
    
    wx.showLoading({ title: '加载中...' })
    
    wx.cloud.callFunction({
      name: 'address', // 您的地址云函数名
      data: {
        action: 'list' // 无需传递 openid
      },
      success: res => {
        console.log('[云函数] [address] [list] 获取地址列表成功:', res.result);
        if (res.result && res.result.code === 200) { // 假设成功 code 为 200
          this.setData({
            addresses: res.result.data || []
          })
        } else {
          wx.showToast({
            title: res.result.message || '获取地址失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('[云函数] [address] [list] 调用失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  loadRegionData: function() {
    const regionData = require('../../utils/region.js') //
    this.setData({
      provinces: regionData.provinces
    })
    
    if (regionData.provinces.length > 0) {
      this.setData({
        cities: regionData.provinces[0].cities || []
      })
      
      if (regionData.provinces[0].cities && regionData.provinces[0].cities.length > 0) {
        this.setData({
          districts: regionData.provinces[0].cities[0].districts || []
        })
      }
    }
  },

  selectAddress: function(e) {
    const address = e.currentTarget.dataset.address
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage && typeof prevPage.setAddress === 'function') { // 确保 setAddress 是函数
      prevPage.setAddress(address)
    }
    wx.navigateBack()
  },

  setDefault: function(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address && address.isDefault) return
    
    if (!app.globalData.openid) { // 增加登录检查
        this.showLoginModal(); return;
    }

    wx.showLoading({ title: '设置中...' })
    
    wx.cloud.callFunction({
      name: 'address',
      data: {
        action: 'setDefault',
        addressId: addressId // 无需传递 openid
      },
      success: res => {
        if (res.result && res.result.code === 200) {
          const addresses = this.data.addresses.map(item => {
            return { ...item, isDefault: item._id === addressId }
          })
          this.setData({ addresses })
          wx.showToast({ title: '设置成功', icon: 'success' })
        } else {
          wx.showToast({ title: res.result.message || '设置失败', icon: 'none' })
        }
      },
      fail: err => {
        wx.showToast({ title: '网络请求失败', icon: 'none' })
      },
      complete: () => { wx.hideLoading() }
    })
  },

  editAddress: function(e) {
    const address = e.currentTarget.dataset.address
    this.setData({
      editMode: true,
      formData: {
        id: address._id,
        name: address.name,
        phone: address.phone,
        province: address.province,
        city: address.city,
        district: address.district,
        detail: address.detail,
        isDefault: address.isDefault,
        region: address.province + address.city + address.district
      },
      showForm: true
    })
  },

  deleteAddress: function(e) {
    const addressId = e.currentTarget.dataset.id
    
    if (!app.globalData.openid) { // 增加登录检查
        this.showLoginModal(); return;
    }

    wx.showModal({
      title: '提示',
      content: '确定要删除这个地址吗？',
      success: resModal => { // 更名 res 避免与 wx.cloud.callFunction 的 res 混淆
        if (resModal.confirm) {
          wx.showLoading({ title: '删除中...' })
          wx.cloud.callFunction({
            name: 'address',
            data: {
              action: 'delete',
              addressId: addressId // 无需传递 openid
            },
            success: res => {
              if (res.result && res.result.code === 200) {
                const addresses = this.data.addresses.filter(item => item._id !== addressId)
                this.setData({ addresses })
                wx.showToast({ title: '删除成功', icon: 'success' })
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' })
              }
            },
            fail: err => {
              wx.showToast({ title: '网络请求失败', icon: 'none' })
            },
            complete: () => { wx.hideLoading() }
          })
        }
      }
    })
  },

  addAddress: function() {
    this.setData({
      editMode: false,
      formData: {
        id: '', name: '', phone: '', province: '', city: '', district: '',
        detail: '', isDefault: false, region: ''
      },
      showForm: true
    })
  },

  hideAddressForm: function() { this.setData({ showForm: false }) },
  inputName: function(e) { this.setData({ 'formData.name': e.detail.value }) },
  inputPhone: function(e) { this.setData({ 'formData.phone': e.detail.value }) },
  inputDetail: function(e) { this.setData({ 'formData.detail': e.detail.value }) },
  switchDefault: function(e) { this.setData({ 'formData.isDefault': e.detail.value }) },
  openRegionPicker: function() { this.setData({ showRegionPicker: true }) },

  regionPickerChange: function(e) {
    const values = e.detail.value
    const provinceIndex = values[0]
    const cityIndex = values[1]
    // const districtIndex = values[2] // districtIndex 未在后续直接使用，注释掉以避免未使用变量警告

    if (provinceIndex !== this.data.regionValue[0]) {
      const cities = this.data.provinces[provinceIndex].cities || []
      const districts = cities.length > 0 ? (cities[0].districts || []) : []
      this.setData({ cities, districts, regionValue: [provinceIndex, 0, 0] })
      // 更新 tempRegion
      this.updateTempRegion([provinceIndex, 0, 0]);
      return
    }
    
    if (cityIndex !== this.data.regionValue[1]) {
      const districts = this.data.cities[cityIndex].districts || []
      this.setData({ districts, regionValue: [provinceIndex, cityIndex, 0] })
      this.updateTempRegion([provinceIndex, cityIndex, 0]);
      return
    }
    
    this.setData({ regionValue: values })
    this.updateTempRegion(values);
  },

  // 辅助函数更新tempRegion
  updateTempRegion: function(values) {
    const province = this.data.provinces[values[0]];
    const city = this.data.cities[values[1]];
    const district = this.data.districts[values[2]];
    
    this.setData({
      tempRegion: {
        province: province ? province.name : '',
        city: city ? city.name : '',
        district: district ? district.name : '',
        region: (province ? province.name : '') + (city ? city.name : '') + (district ? district.name : '')
      }
    });
  },

  cancelRegionPicker: function() { this.setData({ showRegionPicker: false }) },

  confirmRegionPicker: function() {
    this.setData({
      'formData.province': this.data.tempRegion.province,
      'formData.city': this.data.tempRegion.city,
      'formData.district': this.data.tempRegion.district,
      'formData.region': this.data.tempRegion.region,
      showRegionPicker: false
    })
  },

  saveAddress: function() {
    const formData = this.data.formData
    if (!formData.name) { wx.showToast({ title: '请输入收货人姓名', icon: 'none' }); return }
    if (!formData.phone) { wx.showToast({ title: '请输入手机号码', icon: 'none' }); return }
    if (!/^1\d{10}$/.test(formData.phone)) { wx.showToast({ title: '手机号码格式不正确', icon: 'none' }); return }
    if (!formData.region) { wx.showToast({ title: '请选择所在地区', icon: 'none' }); return }
    if (!formData.detail) { wx.showToast({ title: '请输入详细地址', icon: 'none' }); return }
    
    if (!app.globalData.openid) { // 增加登录检查
        this.showLoginModal(); return;
    }

    wx.showLoading({ title: '保存中...' })
    
    const addressInfo = {
      name: formData.name, phone: formData.phone, province: formData.province,
      city: formData.city, district: formData.district, detail: formData.detail,
      isDefault: formData.isDefault
    }
    
    const callData = {
        action: this.data.editMode ? 'update' : 'add',
        addressInfo: this.data.editMode ? undefined : addressInfo, // add 时用 addressInfo
        updates: this.data.editMode ? addressInfo : undefined,    // update 时用 updates
        addressId: this.data.editMode ? formData.id : undefined
        // 无需传递 openid
    };
    if (!this.data.editMode) delete callData.updates; delete callData.addressId;
    if (this.data.editMode) delete callData.addressInfo;


    wx.cloud.callFunction({
      name: 'address',
      data: callData,
      success: res => {
        if (res.result && res.result.code === 200) {
          this.fetchAddresses()
          this.setData({ showForm: false })
          wx.showToast({ title: this.data.editMode ? '修改成功' : '添加成功', icon: 'success' })
        } else {
          wx.showToast({ title: res.result.message || (this.data.editMode ? '修改失败' : '添加失败'), icon: 'none' })
        }
      },
      fail: err => {
        wx.showToast({ title: '网络请求失败', icon: 'none' })
      },
      complete: () => { wx.hideLoading() }
    })
  },
  // 新增：显示登录提示模态框
  showLoginModal: function() {
    wx.showModal({
      title: '登录提示',
      content: '请先登录后再进行操作。',
      confirmText: '去登录',
      showCancel: false, // 或者设置为 true 并处理取消操作
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/index'
          });
        }
      }
    });
  }
})