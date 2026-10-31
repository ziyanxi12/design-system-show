import { createContext, useContext, useEffect, useState } from 'react'
import { Button, Result, Spin } from 'antd'
import { getUserInfo, redirectToLogin, redirectToLogout } from '../utils/auth'
import { checkAuth, type Role } from '../utils/whitelist'

const RoleContext = createContext<Role>(null)

/** 当前登录账号的白名单角色（super=admin 及以上 / admin=可编辑 / null=只读） */
export const useRole = () => useContext(RoleContext)

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = getUserInfo()
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading')
  const [role, setRole] = useState<Role>(null)

  useEffect(() => {
    if (!user) return
    checkAuth()
      .then((r) => {
        if (r.allowed) {
          setRole(r.role)
          setState('ok')
        } else {
          setState('denied')
        }
      })
      .catch(() => setState('error'))
  }, [])

  if (!user) {
    redirectToLogin()
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 15 }}>
        正在跳转登录页…
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="正在校验访问权限…" size="large">
          <div style={{ width: 240, height: 80 }} />
        </Spin>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <Result
          status="403"
          title="无权访问设计系统管理台"
          subTitle={`账号 ${user.account} 不在设计系统白名单内，请联系管理员添加。`}
          extra={
            <Button type="primary" onClick={redirectToLogout}>
              退出登录
            </Button>
          }
        />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <Result
          status="error"
          title="权限校验失败"
          subTitle="无法连接后端服务，请确认服务已启动后重试。"
          extra={
            <>
              <Button type="primary" onClick={() => window.location.reload()}>
                重试
              </Button>
              <Button onClick={redirectToLogout}>退出登录</Button>
            </>
          }
        />
      </div>
    )
  }

  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}
