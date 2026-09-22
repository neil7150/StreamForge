import { StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors } from '../theme/colors'
import type { MainTabParamList, RootStackParamList } from './types'

// Screens
import { HomeScreen } from '../screens/HomeScreen'
import { BrowseScreen } from '../screens/BrowseScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { LibraryScreen } from '../screens/LibraryScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { MovieDetailScreen } from '../screens/MovieDetailScreen'
import { SeriesDetailScreen } from '../screens/SeriesDetailScreen'
import { PlayerScreen } from '../screens/PlayerScreen'
import { LoginScreen } from '../screens/LoginScreen'

// Icons
import { Home, Compass, Search, Library, Settings } from 'lucide-react-native'

const Tab = createBottomTabNavigator<MainTabParamList>()
const Stack = createNativeStackNavigator<RootStackParamList>()

function MainTabs() {
  const insets = useSafeAreaInsets()
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 56 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 6)
          }
        ],
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: styles.tabBarLabel
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size || 20} color={color} />
        }}
      />
      <Tab.Screen
        name="Browse"
        component={BrowseScreen}
        options={{
          tabBarLabel: 'Browse',
          tabBarIcon: ({ color, size }) => <Compass size={size || 20} color={color} />
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, size }) => <Search size={size || 20} color={color} />
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, size }) => <Library size={size || 20} color={color} />
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size || 20} color={color} />
        }}
      />
    </Tab.Navigator>
  )
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade'
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="MovieDetail"
        component={MovieDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SeriesDetail"
        component={SeriesDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          animation: 'fade',
          gestureEnabled: false
        }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom'
        }}
      />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    paddingTop: 8
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600'
  }
})
