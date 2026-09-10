import type { ApiClient, AuthenticatedUser } from '../services/api.js';
import './problem-library.css';

const rows = [
  ['P1000', 'A + B Problem', '入门', '模拟', '洛谷', '98.7%', '125,430'],
  ['P1001', 'A + B 问题', '入门', '模拟', '洛谷', '98.1%', '98,234'],
  ['CF1A', 'Theatre Square', '普及', '数学', 'Codeforces', '72.3%', '231,442'],
  ['AT_ABC_001_A', '積雪深さ', '入门', '模拟', 'AtCoder', '96.4%', '87,230'],
  ['P1048', '数学三角形', '普及', '动态规划', '洛谷', '62.1%', '64,331'],
  ['P1113', '杂务', '普及', '贪心', '洛谷', '58.7%', '51,203'],
  ['CF266B', 'Queue at the School', '普及', '模拟', 'Codeforces', '68.9%', '121,045'],
  ['P1216', '数字三角形', '提高', '搜索', '洛谷', '36.2%', '43,876'],
  ['AT_ABC_170_C', 'Forbidden List', '普及', '集合', 'AtCoder', '71.5%', '52,441'],
  ['P1801', '黑匣子', '提高', '数据结构', '洛谷', '33.6%', '38,224'],
  ['CF528B', 'Fuzzy Search', '提高', '字符串', 'Codeforces', '45.1%', '76,521'],
  ['P3379', '最近公共祖先（LCA）', '提高', '树', '洛谷', '49.8%', '91,233'],
  ['AT_ABC_240_F', 'Shift and Inversions', '省选', '数据结构', 'AtCoder', '27.6%', '28,941'],
  ['P4634', '[SDOI2018] 表达式', '省选', '数学', '洛谷', '24.3%', '19,322'],
];

export function ProblemLibrary({ api: _api, user: _user }: { api: ApiClient; user: AuthenticatedUser | null }) {
  return <section className="problem-library">
    <header className="problem-library-hero"><p>在题目中遇见更大的世界</p><h1>题库</h1><span>精选优质题目，循序渐进，见证你的成长。</span></header>
    <div className="problem-library-layout">
      <aside className="problem-sidebar"><button className="sidebar-custom-filter">＋　自定义筛选</button><section><h2>我的筛选 <small>管理</small></h2>{['♡　我的收藏　128','◷　最近浏览　36','✓　已通过　342','◷　待练习　520'].map((x)=><div className="sidebar-item" key={x}>{x}</div>)}</section><section><h2>难度分类</h2>{['🟢　入门　1,234','🔵　普及　2,341','🟠　提高　1,856','🔴　省选　620'].map((x)=><div className="sidebar-item" key={x}>{x}</div>)}</section><section><h2>题目来源</h2>{['⌁　洛谷　2,341','▥　Codeforces　1,203','◉　AtCoder　856','◈　LeetCode　430','♡　AcWing　398','⊞　其他　623'].map((x)=><div className="sidebar-item" key={x}>{x}</div>)}</section></aside>
      <main className="problem-library-main"><div className="problem-filters"><h2>题目分类</h2><div className="category-tabs">{['全部题目','基础入门','数据结构','动态规划','图论','字符串','数学','其他⌄'].map((x,i)=><button className={i?'':'active'} key={x}>{x}</button>)}</div><div className="filter-line"><b>题目来源</b>☑ 洛谷　☑ Codeforces　□ AtCoder　□ LeetCode　□ AcWing　□ SPOJ　□ 其他</div><div className="filter-line"><b>难度等级</b>☑ 入门　☑ 普及　□ 提高　□ 省选</div><div className="filter-inputs"><b>标签</b><select><option>选择标签（可多选）</option></select><b>关键词</b><input placeholder="输入题目标题、描述关键词等…" /></div><div className="filter-line"><b>其他筛选</b><select><option>时间限制　不限</option></select><select><option>内存限制　不限</option></select><select><option>通过率　不限</option></select><button className="filter-submit">筛选题目</button><button className="filter-reset">重置</button></div></div><div className="problem-results-heading">共 <b>5,632</b> 道题目 <span><select><option>默认排序</option></select> ☷　⊞</span></div><div className="problem-table"><div className="problem-table-header">#　　题目标题　　　　　　难度　　标签　　　　来源　　 通过率　提交数　收藏　操作</div>{rows.map((r)=><a href={`/problems/${r[0]}`} className="problem-row" key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><em>{r[2]}</em><i>{r[3]}</i><span>{r[4]}</span><span>{r[5]}</span><span>{r[6]}</span><span>☆</span><mark>练习</mark></a>)}</div></main>
      <aside className="problem-rightbar"><section className="right-card"><h2>我的做题情况</h2><div className="progress"><strong>34%</strong><span>已通过　342<br/>总题目　1,000<br/>正在努力中　✦</span></div></section><section className="right-card"><h2>热门标签</h2><div className="hot-tags">{['模拟 1,234','动态规划 980','贪心 856','图论 742','字符串 689','数学 621','搜索 598','数据结构 521','构造 430','思维 412','二分 389','前缀和 318','并查集 301','最短路 276'].map(x=><span key={x}>{x}</span>)}</div></section><section className="right-card"><h2>近期更新</h2>{['P1056　2023-09-28','CF1933B　2023-09-27','AT_ABC_314_C　2023-09-26','P8765　2023-09-25','洛谷Pxxxx　2023-09-24'].map(x=><div className="recent" key={x}>{x}</div>)}</section><blockquote>“　每一道题，<br/>　都是通往更大世界的一小步。<cite>— LibreOJ</cite></blockquote></aside>
    </div>
  </section>;
}
