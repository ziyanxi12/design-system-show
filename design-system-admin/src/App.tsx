import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import Layout from './pages/Layout'
import DesignSystemList from './pages/DesignSystemList'
import PeopleManagement from './pages/PeopleManagement'
import OperationLogs from './pages/OperationLogs'
import StatsPage from './pages/StatsPage'

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Table: { headerBg: '#f8fafc', borderColor: '#f1f5f9' },
        },
      }}
    >
      <AntApp>
        <HashRouter>
          <Routes>
            <Route
              element={
                <AuthGuard>
                  <Layout />
                </AuthGuard>
              }
            >
              <Route path="/" element={<Navigate to="/list" replace />} />
              <Route path="/list" element={<DesignSystemList />} />
              <Route path="/people" element={<PeopleManagement />} />
              <Route path="/logs" element={<OperationLogs />} />
              <Route path="/stats" element={<StatsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/list" replace />} />
          </Routes>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}
