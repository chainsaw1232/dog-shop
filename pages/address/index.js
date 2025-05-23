// address/index.js
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
    // 判断是否为选择地址模式
    if (options.select === 'true') {
      this.setData({ selectMode: true })
    }
    
    // 加载省市区数据
    this.loadRegionData()
  },

  onShow: function() {
    // 获取地址列表
    this.fetchAddresses()
  },

  // 获取地址列表
  fetchAddresses: function() {
    if (!app.globalData.openid) {
      console.warn('fetchAddresses: openid is null, cannot fetch addresses.');
      return;
    }
    
    wx.showLoading({ title: '加载中...' })
    
    // 使用云函数获取地址列表
    wx.cloud.callFunction({
      name: 'address',
      data: {
        action: 'list',
        openid: app.globalData.openid
      },
      success: res => {
        console.log('[云函数] [address] [list] 获取地址列表成功:', res.result);
        if (res.result && res.result.code === 200) {
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

  // 加载省市区数据
  loadRegionData: function() {
    // 这里使用静态数据或从API获取
    // 实际项目中可能需要从后端获取或使用第三方库
    const regionData = require('../../utils/region.js')
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

  // 选择地址（选择模式下）
  selectAddress: function(e) {
    const address = e.currentTarget.dataset.address
    
    // 将选中的地址信息传回上一页
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage && prevPage.setAddress) {
      prevPage.setAddress(address)
    }
    
    wx.navigateBack()
  },

  // 设为默认地址
  setDefault: function(e) {
    const addressId = e.currentTarget.dataset.id
    
    // 检查是否已经是默认地址
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address && address.isDefault) return
    
    wx.showLoading({ title: '设置中...' })
    
    // 使用云函数设置默认地址
    wx.cloud.callFunction({
      name: 'address',
      data: {
        action: 'setDefault',
        openid: app.globalData.openid,
        addressId: addressId
      },
      success: res => {
        console.log('[云函数] [address] [setDefault] 设置默认地址成功:', res.result);
        if (res.result && res.result.code === 200) {
          // 更新本地地址列表
          const addresses = this.data.addresses.map(item => {
            return {
              ...item,
              isDefault: item._id === addressId
            }
          })
          
          this.setData({ addresses })
          
          wx.showToast({
            title: '设置成功',
            icon: 'success'
          })
        } else {
          wx.showToast({
            title: res.result.message || '设置失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('[云函数] [address] [setDefault] 调用失败:', err);
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

  // 编辑地址
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

  // 删除地址
  deleteAddress: function(e) {
    const addressId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '提示',
      content: '确定要删除这个地址吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          
          // 使用云函数删除地址
          wx.cloud.callFunction({
            name: 'address',
            data: {
              action: 'delete',
              openid: app.globalData.openid,
              addressId: addressId
            },
            success: res => {
              console.log('[云函数] [address] [delete] 删除地址成功:', res.result);
              if (res.result && res.result.code === 200) {
                // 更新本地地址列表
                const addresses = this.data.addresses.filter(item => item._id !== addressId)
                this.setData({ addresses })
                
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                })
              } else {
                wx.showToast({
                  title: res.result.message || '删除失败',
                  icon: 'none'
                })
              }
            },
            fail: err => {
              console.error('[云函数] [address] [delete] 调用失败:', err);
              wx.showToast({
                title: '网络请求失败',
                icon: 'none'
              })
            },
            complete: () => {
              wx.hideLoading()
            }
          })
        }
      }
    })
  },

  // 添加地址
  addAddress: function() {
    this.setData({
      editMode: false,
      formData: {
        id: '',
        name: '',
        phone: '',
        province: '',
        city: '',
        district: '',
        detail: '',
        isDefault: false,
        region: ''
      },
      showForm: true
    })
  },

  // 隐藏地址表单
  hideAddressForm: function() {
    this.setData({ showForm: false })
  },

  // 输入收货人姓名
  inputName: function(e) {
    this.setData({
      'formData.name': e.detail.value
    })
  },

  // 输入手机号码
  inputPhone: function(e) {
    this.setData({
      'formData.phone': e.detail.value
    })
  },

  // 输入详细地址
  inputDetail: function(e) {
    this.setData({
      'formData.detail': e.detail.value
    })
  },

  // 切换默认地址开关
  switchDefault: function(e) {
    this.setData({
      'formData.isDefault': e.detail.value
    })
  },

  // 打开地区选择器
  openRegionPicker: function() {
    this.setData({ showRegionPicker: true })
  },

  // 地区选择器变化
  regionPickerChange: function(e) {
    const values = e.detail.value
    const provinceIndex = values[0]
    const cityIndex = values[1]
    const districtIndex = values[2]
    
    // 更新城市列表
    if (provinceIndex !== this.data.regionValue[0]) {
      const cities = this.data.provinces[provinceIndex].cities || []
      const districts = cities.length > 0 ? (cities[0].districts || []) : []
      
      this.setData({
        cities,
        districts,
        regionValue: [provinceIndex, 0, 0]
      })
      
      return
    }
    
    // 更新区县列表
    if (cityIndex !== this.data.regionValue[1]) {
      const districts = this.data.cities[cityIndex].districts || []
      
      this.setData({
        districts,
        regionValue: [provinceIndex, cityIndex, 0]
      })
      
      return
    }
    
    this.setData({
      regionValue: values
    })
    
    // 保存临时选择的地区
    const province = this.data.provinces[provinceIndex]
    const city = this.data.cities[cityIndex]
    const district = this.data.districts[districtIndex]
    
    this.setData({
      tempRegion: {
        province: province.name,
        city: city.name,
        district: district.name,
        region: province.name + city.name + district.name
      }
    })
  },

  // 取消地区选择
  cancelRegionPicker: function() {
    this.setData({ showRegionPicker: false })
  },

  // 确认地区选择
  confirmRegionPicker: function() {
    this.setData({
      'formData.province': this.data.tempRegion.province,
      'formData.city': this.data.tempRegion.city,
      'formData.district': this.data.tempRegion.district,
      'formData.region': this.data.tempRegion.region,
      showRegionPicker: false
    })
  },

  // 保存地址
  saveAddress: function() {
    const formData = this.data.formData
    
    // 表单验证
    if (!formData.name) {
      wx.showToast({
        title: '请输入收货人姓名',
        icon: 'none'
      })
      return
    }
    
    if (!formData.phone) {
      wx.showToast({
        title: '请输入手机号码',
        icon: 'none'
      })
      return
    }
    
    if (!/^1\d{10}$/.test(formData.phone)) {
      wx.showToast({
        title: '手机号码格式不正确',
        icon: 'none'
      })
      return
    }
    
    if (!formData.region) {
      wx.showToast({
        title: '请选择所在地区',
        icon: 'none'
      })
      return
    }
    
    if (!formData.detail) {
      wx.showToast({
        title: '请输入详细地址',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({ title: '保存中...' })
    
    // 构建请求数据
    const addressInfo = {
      name: formData.name,
      phone: formData.phone,
      province: formData.province,
      city: formData.city,
      district: formData.district,
      detail: formData.detail,
      isDefault: formData.isDefault
    }
    
    // 根据是否为编辑模式调用不同的云函数
    if (this.data.editMode) {
      // 使用云函数更新地址
      wx.cloud.callFunction({
        name: 'address',
        data: {
          action: 'update',
          openid: app.globalData.openid,
          addressId: formData.id,
          updates: addressInfo
        },
        success: res => {
          console.log('[云函数] [address] [update] 更新地址成功:', res.result);
          if (res.result && res.result.code === 200) {
            // 刷新地址列表
            this.fetchAddresses()
            
            // 隐藏表单
            this.setData({ showForm: false })
            
            wx.showToast({
              title: '修改成功',
              icon: 'success'
            })
          } else {
            wx.showToast({
              title: res.result.message || '修改失败',
              icon: 'none'
            })
          }
        },
        fail: err => {
          console.error('[云函数] [address] [update] 调用失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
        },
        complete: () => {
          wx.hideLoading()
        }
      })
    } else {
      // 使用云函数添加地址
      wx.cloud.callFunction({
        name: 'address',
        data: {
          action: 'add',
          openid: app.globalData.openid,
          addressInfo: addressInfo
        },
        success: res => {
          console.log('[云函数] [address] [add] 添加地址成功:', res.result);
          if (res.result && res.result.code === 200) {
            // 刷新地址列表
            this.fetchAddresses()
            
            // 隐藏表单
            this.setData({ showForm: false })
            
            wx.showToast({
              title: '添加成功',
              icon: 'success'
            })
          } else {
            wx.showToast({
              title: res.result.message || '添加失败',
              icon: 'none'
            })
          }
        },
        fail: err => {
          console.error('[云函数] [address] [add] 调用失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
        },
        complete: () => {
          wx.hideLoading()
        }
      })
    }
  }
})
