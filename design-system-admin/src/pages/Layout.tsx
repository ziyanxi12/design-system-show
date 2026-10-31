import { Button, Layout as AntLayout, Menu } from 'antd'
import {
  BarChartOutlined,
  LogoutOutlined,
  TableOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUserInfo, redirectToLogout } from '../utils/auth'

const MENU_ITEMS = [
  { key: '/list', icon: <TableOutlined />, label: '设计系统管理' },
  { key: '/people', icon: <TeamOutlined />, label: '人员管理' },
  { key: '/logs', icon: <TableOutlined />, label: '操作记录' },
  { key: '/stats', icon: <BarChartOutlined />, label: '数据统计' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = getUserInfo()
  const selected = MENU_ITEMS.some((m) => pathname.startsWith(m.key))
    ? MENU_ITEMS.find((m) => pathname.startsWith(m.key))!.key
    : '/list'

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <AntLayout.Sider width={220} theme="dark">
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 1,
          }}
        >
          设计系统管理台
        </div>
        {/* flex:1 占满剩余高度（配合 index.css 的 sider-children flex 规则），把用户区顶到底部 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS}
          style={{ flex: 1, overflowY: 'auto', borderRight: 0 }}
        />
        {/* 底部：当前用户 + 退出登录（深色侧边栏主题） */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            title={user?.nickName ?? '未知用户'}
            style={{
              color: 'rgba(255, 255, 255, 0.65)',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <UserOutlined style={{ marginRight: 8, flexShrink: 0 }} />
            {user?.nickName ?? '未知用户'}
          </span>
          <Button
            type="text"
            size="small"
            icon={<LogoutOutlined />}
            onClick={redirectToLogout}
            style={{ color: 'rgba(255, 255, 255, 0.65)', flexShrink: 0 }}
          >
            退出登录
          </Button>
        </div>
      </AntLayout.Sider>
      <AntLayout>
        <AntLayout.Content style={{ padding: 24, background: '#f1f5f9' }}>
          <Outlet />
        </AntLayout.Content>
      </AntLayout>
    </AntLayout>
  )
}
