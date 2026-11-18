# 四上课程数据来源与映射

更新时间：2026-11-18

## 唯一数据源

- 文件：`D:/English/C端产品内容设计.xlsx`
- 课程大纲工作表：`四上学课程大纲`
- 单元内容工作表：`四上 单元内容`
- 教材版本：四上课程大纲与学习内容
- 说明：当前项目只保留这套课程的 U1–U10；其他教材版本和旧单元内容已移除。

## 单元映射

| 单元 | 主题 | 单词数 | 句型数 | 自然拼读 |
|---|---|---:|---:|---|
| U1 | This is our school / 我的学校 | 25 | 3 | lion, letter, line, light |
| U2 | What time do you get up? / 我的一天 | 27 | 3 | milk, monkey, mango, moon |
| U3 | I like dumplings / 食物 | 14 | 3 | nose, night, nine, net |
| U4 | Look at the elephant / 动物 | 22 | 3 | cold, rose, photo, phone |
| U5 | Can you play basketball? / 能力与运动 | 21 | 3 | dolly, hot, socks, pot |
| U6 | What are those? / 自然与花园 | 17 | 3 | panda, paper, pear, potato |
| U7 | Whose watch is this? / 我的物品 | 13 | 3 | queen, quiet, quilt, quarter |
| U8 | Don't talk in the library / 规则 | 20 | 6 | red, robot, run, rope |
| U9 | Welcome to my home! / 我的家 | 13 | 3 | sea, sit, say, sand |
| U10 | What's her job? / 职业 | 20 | 4 | two, toy, tiger, taxi |

## 运行时文件

| 文件 | 作用 |
|---|---|
| `src/data/textbook.js` | 10 个单元的单词、句型、课文、自然拼读 |
| `src/data/knowledgePoints.js` | 从当前课程生成 60 个候选考点 |
| `src/data/curriculum.js` | 当前单元切片、U1 示例题 |
| `src/data/wrongCases.js` | 从真实作答生成错题，不再提供外部示例内容 |

## 已删除内容

- PEP 四上旧的 6 单元数据
- 冀教版四上数据
- 湘少版四上数据
- 旧的多教材注册、旧考点文件和旧示例题

## 注意

- 课程中新增或替换内容时，应同步修改 `textbook.js`，再重新加载页面。
- 知识点由课程数据生成，不再维护第二份硬编码考点表。
- 题目中的英文词必须来自当前单元词表、当前单元自然拼读词或功能词白名单。
